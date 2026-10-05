import InteractiveRoadMap from "./components/InteractiveRoadMap";
import OverviewLive from "../../components/overview/OverviewLive";

/**
 * Overview.
 *
 * Opens on a hero (5 Oct 2026, at the user's request, after the reference
 * they supplied): the 3D mascot centre-stage on the WebGL stage, the
 * oversized "Overview" title, the corridor span and two short columns of live
 * status. The hero is the page header here: it carries the group eyebrow, the
 * h1 and the description the other pages get from PageHeader.
 *
 * Scrolling down: the counts, every slow or congested exit-direction worst
 * first, the corridor at true scale, then the Live Corridor Status panel,
 * unchanged in what it shows. (The 3D corridor scene was removed at the
 * user's request on 4 Oct 2026.)
 */
export default function DashboardHomePage() {
  return (
    <section className="ds-content ov-page">
      <OverviewLive />
      <div data-section="Live Corridor Status" className="ov-corridor">
        <InteractiveRoadMap />
      </div>
    </section>
  );
}
