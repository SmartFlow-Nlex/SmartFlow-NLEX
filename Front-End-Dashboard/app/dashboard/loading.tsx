import Mascot from "../../components/stage/Mascot";

/* The route loading state: the mascot's headlights pulse as the loader (the
   same signal as the session check), with the same words as before. */
export default function DashboardLoading() {
  return (
    <section className="ds-content">
      <div className="ds-loader-container" role="status" aria-live="polite">
        <Mascot size={96} mood="loading" />
        <p>Loading dashboard data...</p>
      </div>
    </section>
  );
}
