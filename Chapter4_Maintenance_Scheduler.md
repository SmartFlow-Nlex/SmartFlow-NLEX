# 4.2 System Implementation (continued)

*DRAFTING NOTE: This subsection follows 4.2.4 (Authentication and Session Management). The
numbering caveat given in 4.2.1 applies here too: if the group renumbers 4.2 as 4.3, this
becomes 4.3.5.*

*Figure numbers continue the running sequence described in Note 4. Figure 4.1.36 is the last
assigned in the authentication section, so the figures below take 4.1.37 and 4.1.38.*

---

## 4.2.5 Maintenance Scheduler

Planned roadwork is the one source of corridor disruption the operator knows
about in advance. The Maintenance Scheduler is where that knowledge is recorded:
what work is planned, which stretch of carriageway it occupies, in which
direction, how much of the roadway it closes, and when. Unlike the analytical
modules reported in Section 4.1, which read the warehouse, this module writes to
it — it is the system's only operator-authored data source, and the mobile
application described in Section 3.13 consumes the same records.

### 4.2.5.1 Data Captured

A schedule is located on the corridor by kilometre marker rather than by exit
name. Markers are continuous and exits are not: work frequently occupies a
stretch between two exits, which an exit-based field cannot express.

**Table 4.2.13** *Maintenance Schedule Fields*

| Field | Type | Constraint |
| --- | --- | --- |
| Title | Text | 3–120 characters, required |
| Description | Text | Optional, up to 2,000 characters |
| Start KM / End KM | Decimal | 0–100; end must be at or beyond start |
| Direction | Enumeration | Northbound, Southbound, or Both |
| Lane closure | Enumeration | None, Shoulder only, 1 lane, 2 lanes, Full closure |
| Start / End date-time | Timestamp with offset | End must be after start |
| Status | Enumeration | Scheduled, In progress, Completed, Cancelled |

Direction and lane closure are enumerations rather than free text because both
are read by the corridor model, not only by a human. A closure recorded as "one
lane" in one entry and "1 lane" in another would be two values to the database
and one value to the reader.

*[INSERT SCREENSHOT — the scheduling form with a job entered]*

**Figure 4.1.37** *Maintenance Scheduling Form with Kilometre Markers*

### 4.2.5.2 Interface

The page presents the schedule as a filterable list with a status chip on each
row, a counter per status, and a detail panel opened from any row. From that
panel an operator can edit the entry, advance its status, cancel it with a
reason, or delete it.

Cancelling and deleting are offered separately and are not alternatives:

- **Cancelling** keeps the row, marks it cancelled, and records a reason. This
  is correct for work that was genuinely planned and then called off — the
  corridor record should still show that a closure was intended for that window,
  because a reader asking why traffic behaved unusually that night is entitled to
  find it.
- **Deleting** removes the row. This is correct only for an entry that should
  never have existed: a duplicate, or a typed mistake.

The distinction is stated in the confirmation dialog rather than left to the
operator to infer, because two destructive-sounding actions side by side is
otherwise a guess.

*[INSERT SCREENSHOT — the delete confirmation dialog]*

**Figure 4.1.38** *Delete Confirmation, Distinguishing Deletion from Cancellation*

### 4.2.5.3 Interface to the Application Server

Five endpoints back the page. All validation is performed on the server; the
form's own checks are a convenience, and the server does not trust them.

**Table 4.2.14** *Maintenance Endpoints*

| Method | Path | Purpose | Answers |
| --- | --- | --- | --- |
| POST | `/api/maintenance/schedule` | Create | 201 created, 400 invalid, 503 database unreachable |
| GET | `/api/maintenance/list` | List, filterable by status | 200, 503 |
| PUT | `/api/maintenance/:id` | Replace an entry | 200, 400, 404, 503 |
| PATCH | `/api/maintenance/:id/status` | Advance or cancel | 200, 400, 404, 409 invalid transition, 503 |
| DELETE | `/api/maintenance/:id` | Remove an entry | 200, 404, 503 |

Two properties of this interface are worth recording.

**No mock fallback.** Where the database cannot be reached, every endpoint
answers 503 and says so. None substitutes placeholder data. The mobile
application consumes these same endpoints, and a fabricated success there would
place a closure on an operator's screen that does not exist in the warehouse.

**Every mutation is audited.** Creation, edit, status change, and deletion each
write an entry to the audit log described in Section 4.1.8, recording the actor
and what changed. The write is fire-and-forget: a failure in the audit path never
fails the operation the operator requested.

### 4.2.5.4 Defects Identified and Corrected

Exercising the endpoints against their acceptance criteria revealed two faults.
Both concerned the boundaries of valid input rather than the main path, which is
why neither had surfaced in ordinary use.

**Table 4.2.15** *Maintenance Scheduler Defects*

| # | Defect | Consequence | Correction |
| --- | --- | --- | --- |
| 1 | The kilometre range was not ordered | A job could be saved running from Km 40 to Km 10. Every consumer reads the pair as a span, so a reversed entry yields a negative length: the dashboard draws nothing and the mobile application reports a closure of less than zero kilometres | The server now requires the end marker to be at or beyond the start. Equality is still permitted, since work at a single marker is a legitimate entry |
| 2 | Deletion did not check whether a row was removed | A `DELETE` against an identifier that did not exist answered 200 "Deleted" and wrote an audit entry for a deletion that never happened — the audit log recording an event the database never saw | Deletion now distinguishes the three outcomes and answers 404 where no row matched |
| 3 | A malformed identifier was reported as a database outage | The identifier reached the database, which rejected it as badly formed. The service treats every query failure alike and reports the database unreachable, so a mistyped identifier answered 503 — telling the operator the warehouse was down while it was healthy, and raising an infrastructure alarm for what was a bad request | The identifier is checked before the database is consulted, and an unparseable one answers 404 |

Defect 1 was not hypothetical. A record already in the table — a toll booth
repair entered as Km 76.25 to Km 73.23 — carries a reversed range and is in the
`in progress` state. The validation now prevents another, but the existing row
predates it and requires correction by hand.

Defect 2 is the more instructive of the two. The update path had always
distinguished a missing row and answered 404; the delete path, written alongside
it, discarded the row count and reported success unconditionally. The two sat in
the same file. An interface can be inconsistent with itself in a way that no
single reading of either half reveals.

### 4.2.5.5 Verification

The module was tested at two levels: the endpoints directly, and the delivered
interface driven through a browser with a signed-in operator account.

**Table 4.2.16** *Maintenance Scheduler Test Results*

| # | Scenario | Expected | Observed |
| --- | --- | --- | --- |
| 1 | Submit with empty fields | Rejected | 400, field named |
| 2 | Title shorter than three characters | Rejected | 400 |
| 3 | Negative kilometre marker | Rejected | 400 |
| 4 | Kilometre marker beyond the corridor | Rejected | 400 |
| 5 | End time before start time | Rejected | 400 |
| 6 | End marker before start marker | Rejected | 400 |
| 7 | Direction outside the enumeration | Rejected | 400 |
| 8 | Work at a single marker (start equals end) | Accepted | 201 |
| 9 | Valid submission | Created | 201, row returned |
| 10 | Edit an existing entry | Updated | 200 |
| 11 | Advance status | Updated | 200 |
| 12 | Cancel without a reason | Rejected | 400 |
| 13 | Cancel with a reason | Updated | 200 |
| 14 | Delete an existing entry | Removed | 200, absent from the list |
| 15 | Delete the same entry again | Rejected | 404 |
| 16 | Edit an entry that does not exist | Rejected | 404 |

Ten further checks were performed through the interface itself, signed in as a
Data Analyst: the scheduling form opened and accepted a complete entry; the saved
job appeared in the list; the detail panel opened; the entry was edited and the
change persisted; deletion asked for confirmation before acting; the deleted
entry left the list; and it remained absent after the page was reloaded, which
confirms the removal reached the database rather than only the browser's copy of
the list.

All twenty-six checks passed after the corrections in Section 4.2.5.4. A further
adversarial pass of twenty-four checks — boundary values at both ends of every
numeric and text field, malformed and absent timestamps, script and SQL payloads
in free-text fields, malformed identifiers, and every invalid status transition —
passed in full once defect 3 was corrected.

### 4.2.5.6 Limitation: Status Is Not Reconciled with the Clock

A schedule's status is whatever an operator last set. Nothing advances it when
its window begins, and nothing closes it when the window passes.

The consequence is visible in the delivered system. Both records presently in the
table have windows that closed in August. One is still marked *in progress*, so
the page's summary reports three kilometres of carriageway "under work right
now" for work that finished forty-six days ago. The other is still marked
*scheduled*, which places a count of one beside a caption reading "nothing
upcoming" — the two disagree because the only scheduled item is in the past.

This is a design gap rather than bad data, and the proponents record it as such:
no amount of correcting these two rows prevents the third. Two resolutions are
available. A status could be *derived* for display — a window that has closed
shown as elapsed regardless of the stored value — which changes no data and no
interface contract. Alternatively a scheduled task could advance statuses as
windows open and close, which is closer to how an operations system should
behave but alters records the mobile application also reads, and so is the larger
change.

The proponents recommend the derived presentation as the immediate measure,
because a dashboard that reports current roadwork which ended six weeks ago is
wrong in the way most likely to be noticed and least likely to be forgiven.

---

## Addition to Notes for the Group

*Proposed as item 10, following item 9 in the authentication section.*

10. Section 4.2.5.4 records an existing maintenance record whose kilometre range
    runs backwards (Km 76.25 to Km 73.23) and which is currently in progress.
    The new validation prevents another from being created but does not repair
    this one. The group should correct it before the demonstration, since it is
    the kind of entry a panel notices on screen, and decide whether the
    corridor-facing views should additionally ignore any row whose range is
    reversed, as a defence against records created before the rule existed.
