import { Home } from "lucide-react";
import InteractiveRoadMap from "./components/InteractiveRoadMap";
import OverviewLive from "../../components/overview/OverviewLive";
import PageHeader from "../../components/dashboard/PageHeader";

/**
 * Overview.
 *
 * Opens on the corridor itself: live freshness, a 3D corridor the operator
 * drives with a car (a km cursor) and a km ruler, and the corridor counts.
 * The Live Corridor Status panel follows, unchanged in what it shows.
 *
 * The raster brand banner that used to fill the first screen was removed in
 * the Lane Signal redesign at the user's request (3 Oct 2026); the brand lives
 * in the shell. Its two images stay in /public in case it is wanted back.
 */
export default function DashboardHomePage() {
  return (
    <section className="ds-content ov-page">
      <PageHeader
        icon={Home}
        title="Overview"
        subtitle="Balintawak Km 12 to Sta. Ines Km 88.25, both carriageways"
      />
      <OverviewLive />
      <InteractiveRoadMap />
    </section>
  );
}
