# Prescriptive emissions optimiser — specification

Replaces the three hardcoded bars in `app/dashboard/sustainability/page.tsx`
(`prescriptiveEmissionReduction`, values `[8, 14, 22]`, labelled **Illustrative**)
with strategies computed from warehouse data.

Written 2026-09-29. **Revised 2026-10-02:** one CO₂ source for the whole
Emissions tab, per-incident idling, Monte Carlo ranges, and a delay-induced
carbon KPI. Verified against the live database, not assumed.

---

## 1. The emissions model you are optimising against

Every CO₂ figure on the Emissions tab — Descriptive, Predictive and
Prescriptive — comes from `gold.fact_emissions_hourly`:

```
CO₂(e,h,d)  =  Σ_c  count(e,h,d,c) × segment_km(e) × F(c)
```

for exit `e`, hour `h`, direction `d`, vehicle class `c`. The counts are the
hourly toll counts (`gold.fact_traffic_hourly`), `segment_km` is each exit's
share of the corridor (`gold.exit_segment_km`), and `F(c)` comes from
`nlex_emission_factors` (DENR/DOTC):

| class | label | F(c) g/km | % of traffic | % of CO₂ |
|---|---|---:|---:|---:|
| 1 | Light | **192** | 78.09 | 43.66 |
| 2 | Medium | **354** | 13.05 | 12.96 |
| 3 | Heavy | **1492** | 8.86 | **43.38** |

Verified: rebuilding a day's CO₂ from counts × km × factor reproduces the
table's `co2_tonnes` exactly (2025-06-01: 318.395 t both ways). Record:
2022-01-01 → 2026-06-30, 19 exits. The CO₂ forecast is trained on this same
table, and every hourly toll upload rebuilds it for the days it covers, so the
three views agree and move together.

**Not `nlex_theoretical_emissions`.** It covers 10 of the 20 exits and holds two
rows for almost every (exit, hour, direction, class) key (1,420 of 1,430 on a
sampled day), so summing it counted the corridor about twice: 514 t/day for
2025 against 442 t/day from the toll record across 19 exits.

**Directions.** 29.5% of 2025's CO₂ is at plazas the record does not split by
direction (Angeles and Mexico as `NB/SB`; Balagtas, Harbor Link and Sta. Ines
with none). It is shown as its own share, never guessed into a carriageway.

### ⚠ The consequence, before you design anything

**This model is linear and has no speed term**, so **peak-spreading is a
no-op**: moving a trip from 17:00 to 10:00 changes its emissions by exactly
zero. CO₂ per vehicle-km does vary by hour (254–607 g), but that is the fleet
mix — heavy vehicles are a far larger share at night — not congestion.

Do not build a "shift demand off-peak" strategy (dynamic tolling, truck time
windows). It would report a saving the model cannot produce. The peak *does*
matter, but only through Strategy C.

---

## 2. The idling sub-model (delay-induced carbon; Strategies B and C)

Idling sits *outside* the linear model. A queue builds behind an incident while
it is live and drains as it clears, so the vehicle-minutes lost are the area of
that triangle:

```
idle_CO₂_kg(incident) = (λ / 60) × T² / 2 × φ
```

`λ` = vehicles per hour on **one exit-segment in one direction** at the hour the
incident started (the record's hourly volume ÷ days ÷ exits ÷ 2 carriageways);
`T` = the minutes that incident **blocked a lane** (`blockage_cleared − event_start_date`); `φ` = 0.0192 kg CO₂ per
vehicle-minute (Climatiq's petrol-car factor × 0.10 for idling, held as a
constant so runs are reproducible and cost no API quota).

**T is blockage time, not site-clearance time** (corrected 2026-10-12). Until then
`T` was `clearance_min`, the time to *site* cleared: a vehicle off the road that
never blocked a lane and was recovered hours later counted as hours of queueing.
On 2025, 18 of the 61 "over three hours" incidents had no blockage at all, and
ΣT² on blockage time is 29.6% of what it was. Incidents with no blockage, or
with a blockage longer than 24 hours (one record of 10,085 minutes, a date
typing error), are left out.

**Quadratic in T**, so the long tail carries it: in 2025, 26 blockages of three
hours or more were 65% of the delay-induced carbon. Each incident is charged at
**its own** T — squaring a band's mean would understate the tail.

The old per-incident calculator (`calculateRow`) charged every vehicle the full
delay (λ × T², no /2) over the corridor-wide volume — 40× high — and called
Climatiq live. Nothing called it; it is removed.

**Shown on the Descriptive view** as the *Delay-Induced CO₂* KPI: 377 t in
2025, 0.23% of the corridor's CO₂ (1,152 t before the blockage-time correction).

---

## 3. Strategy A — Heavy-vehicle share

Class 3 is 8.86% of vehicles and 43.38% of CO₂. It is the largest lever.

| | |
|---|---|
| **Decision variable** | `δ` — percentage points of Class-3 vehicle-km reassigned to Class 2 |
| **Objective** | minimise `CO₂_total`; saving = `δ/100 × Σ(V·L) × (F₃ − F₂)` |
| **Constraints** | `0 ≤ δ ≤ heavy share in the Range` (no more heavy vehicle-km can move than exist). `δ` is a **stated policy target**, default 1 pp. Total vehicle-km conserved: a composition shift, not traffic removal. |
| **Data** | `gold.fact_emissions_hourly` (`class_3`, `total`, `segment_km`), `nlex_emission_factors` |

### This one is a sensitivity, not an optimisation — label it as such

The heavy share of vehicle-km does move: 8.05% (Dec 2025) to 11.32%
(Jan 2022) across 54 months. But the **lowest months are all Decembers**
(2025, 2024, 2023), when holiday car traffic dilutes the trucks rather than
fewer trucks running. So the record shows the share *can read* lower, not that
anything NLEX controls can make it lower. The bar is drawn hollow, marked a
policy target, and carries that sentence (computed from the record, not
hardcoded). It has no Monte Carlo range: nothing in it is uncertain but the
target chosen.

---

## 4. Strategy B — Lane-blockage time

| | |
|---|---|
| **Decision variable** | `τ_b,h` — target blockage minutes for each band `b` and start hour `h` |
| **Objective** | minimise `Σ_i idle_CO₂(λ_h(i), min(T_i, τ_b(i),h(i)))` over the Range's lane-blocking accidents |
| **Constraints** | `τ_b,h = floor_b,h`, the **10th percentile actually achieved** in that band and hour — you cannot beat your own best observed response. An incident already faster than its floor keeps its own time. |
| **Data** | `silver.nlex_accident_events_clean` (`blockage_cleared`, `event_start_date`, `direction`, `km_value`), λ from `gold.fact_emissions_hourly` |

Bands: under 15 min, 15–60, 60–180, over 180. Blockage is heavily
right-skewed (median 4 min, p90 about 33), so one floor for all would be meaningless.

Each incident strategy also reports **where and when** its saving is: the three
10-km stretches (per carriageway) and the hours that hold most of it, the share
from blockages of an hour or more, and a warning when a single incident is 20%
or more of the figure (2025: one 18.8-hour blockage at Southbound Km 60.1 is 47%).

---

## 5. Strategy C — When to put the responders

The same minute saved is worth far more at some hours than others, because λ
scales with the volume at that hour — nearly 10× between 17:00 and 02:00. This
is the *only* legitimate way the peak enters an emissions strategy.

| | |
|---|---|
| **Decision variable** | `a_h` — share of a fixed response capacity assigned to hour `h` |
| **Objective** | maximise CO₂ avoided = Strategy B's saving, counted only in the hours the capacity is sent to |
| **Constraints** | `Σ_h a_h = A` (capacity fixed — allocation, not hiring), sent to the 12 hours with the most vehicles exposed; same observed floors as B |
| **Data** | as Strategy B |

Always at most Strategy B's saving: B and C must not be added together.

---

## 6. Monte Carlo ranges (B and C)

B and C depend on *which* incidents happen in a Range — and, being quadratic,
on how many long ones. One figure overstates how well that is known. The
Range's incidents are resampled with replacement 400 times (a seeded bootstrap,
so the same Range gives the same range), both savings recomputed against the
same observed floors, and the **5th–95th percentile** reported. 2025: shorter
blockages 204 t, likely 89–391 t; busiest-hours deployment 167 t, likely 52–359 t.

---

## 7. Output contract

`GET /api/emissions/prescriptive` returns, per strategy:

```ts
{
  key: "fleet_mix" | "clearance" | "deployment",
  label: string,              // no more "Strategy X"
  reductionPct: number,       // vs the same period's actual CO₂
  reductionTonnes: number,
  range: { lowTonnes, highTonnes, lowPct, highPct, runs } | null,   // Monte Carlo, B and C
  lever: string,              // the decision variable's chosen value, in words
  evidenceBounded: boolean,   // false for A: a policy scenario
  evidenceNote?: string,      // for A: what the record does show
  assumptions: string[],      // every bound, and where it came from
}
```

plus `basis` (the Range, the actual CO₂, the incident window and count) and
`unavailable` (strategies a Range cannot support, left out rather than drawn at
0%). `reductionPct` is **relative to the actual CO₂ of the same window**, so the
bars are comparable to each other and to the Descriptive tab.

## 8. Done when

- The bars change when the date Range changes. ✓
- The **Illustrative** chip is gone. ✓
- Every number traces to a query, and each strategy states its own bound and
  where that bound came from. ✓
- No strategy claims a saving from moving traffic between hours. ✓
- Descriptive, Predictive and Prescriptive read the same CO₂ record. ✓

---

## Additions from the modelling diagram (2026-10-14)

The diagram's Recommendations/Strategies boxes for emissions name TOPSIS, CO2 per class-km, a dynamic tolling
recommendation, and a heavy-vehicle window restriction advisory (KPI: Class 3 peak share reduction). All four are
now returned by `GET /api/emissions/prescriptive` and shown on the Prescriptive tab, as tables, not charts.

- **CO2 per class-km** (`classKm`, `corridorGPerVkm`): 192 / 354 / 1,492 g per km for classes 1 / 2 / 3, against
  each class's share of vehicle-km and of CO2. 2025: Class 3 is 9.5% of the distance and 42.0% of the CO2.
- **TOPSIS** (`ranking`): the CO2 strategies ranked on four criteria the record can measure: expected saving as
  the record supports it (a policy target counts 0: its figure is whatever target is chosen), the 5th-percentile
  saving, whether the bound has been achieved on NLEX, and the Monte Carlo width (unknown = the widest seen).
  Weights 0.35 / 0.25 / 0.25 / 0.15, a stated choice. 2025: shorter blockages 1.00, busiest-hours deployment
  0.75, heavy share 0.00. The first two overlap, so they are alternatives, not savings to add.
- **Heavy-vehicle window** (`heavyWindow`): the peak is the hours within 10% of the busiest hour's vehicle-km
  (2025: 17:00-20:00); the moved Class-3 vehicle-km go to the quietest hours that stay under the peak's lowest
  hour. KPI: Class 3 share in the window (2025: 3.6% against 9.5% all day; trucks already avoid it). No CO2
  saving is claimed: the model has no congestion term.
- **Dynamic tolling** (`tolling`): the exits with the most Class-3 CO2 in the window (2025: San Fernando 21.5%).
  No toll elasticity is in the record, so the tonnes are what is at stake, not a saving.
