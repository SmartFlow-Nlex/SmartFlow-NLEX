/**
 * One depth of drifting clouds. Every cloud is drawn twice, one screen width
 * apart, and each copy slides left by one screen width per cycle, so the loop
 * has no visible reset. Each cloud moves as its own small layer (cheaper than
 * sliding a screen-sized strip). Each depth gets its own speed (set in CSS),
 * which gives the parallax; reduced motion and the Effects switch stop the drift.
 */
export type Cloud = {
  /** Sprite in /public/environment. */
  src: "a" | "b" | "c" | "d" | "e";
  /** Left edge and top, as a percentage of the screen; keep left + width <= 100. */
  x: number;
  y: number;
  /** Foreground clouds along the bottom: sit on the bottom edge instead of at `y`,
   *  sunk by this share of their own height, so their flat base is never seen. */
  sink?: number;
  /** Width as a percentage of the screen width. */
  w: number;
  opacity?: number;
  flip?: boolean;
};

export default function CloudLayer({ clouds, depth }: { clouds: Cloud[]; depth: "far" | "mid" | "near" }) {
  return (
    <div className={`env-layer env-clouds is-${depth}`} aria-hidden="true">
      {[0, 1].map((copy) =>
        clouds.map((c, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- decorative sprite on its own animated layer; next/image adds nothing here
          <img
            key={`${copy}-${i}`}
            className="env-cloud"
            src={`/environment/cloud-${c.src}.webp`}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              left: `${c.x + copy * 100}%`,
              ...(c.sink != null ? { bottom: 0, translate: `0 ${c.sink}%` } : { top: `${c.y}%` }),
              width: `calc(${c.w}% * var(--cloud-scale, 1))`,
              opacity: c.opacity ?? 1,
              scale: c.flip ? "-1 1" : undefined,
            }}
          />
        )),
      )}
    </div>
  );
}
