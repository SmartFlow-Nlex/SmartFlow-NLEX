"use client";

import NarrativePanel, { NarrativeChip } from "./NarrativePanel";

/**
 * Narrative Explanation for the Forecasted Fleet Composition card.
 *
 * Its own endpoint, because a fleet-mix forecast is a COMPOSITION (three shares
 * that add up to 100%), ranked by Aitchison distance and accepted only when it
 * beats the better of two baselines (Climatology and Persistence). The forecast
 * narrative's MASE-against-last-week reading does not apply to it.
 */

export type FleetMixNarrativeModel = {
  model: string;
  rank: number | null;
  accepted: boolean;
  maePp: number | null;
  mape: number | null;
  heavyWmape: number | null;
  heavyR2: number | null;
  skill: number | null;
  rejectedReason: string | null;
  diagnosis: string | null;
};

export default function FleetMixNarrative({
  models,
  champion,
  heavyNowPct,
  heavyNextPct,
  windowDays,
  projectionDays,
  projectionStart,
  projectionEnd,
  validatedDays,
  surgeDates,
  dataEnds,
  staleDays,
}: {
  models: FleetMixNarrativeModel[];
  champion: string | null;
  heavyNowPct: number | null;
  heavyNextPct: number | null;
  windowDays: number;
  projectionDays: number | null;
  projectionStart: string | null;
  projectionEnd: string | null;
  validatedDays: number;
  surgeDates: string[];
  dataEnds: string | null;
  staleDays: number | null;
}) {
  if (models.length === 0) return null;
  const champ = models.find((m) => m.rank === 1 && m.accepted) ?? null;
  const beatsPersistence = champ?.skill != null && champ.skill < 1;

  return (
    <NarrativePanel
      subtitle="Plain-language read-out of the fleet-mix forecast and how far to trust it"
      metrics={models.map((m) => ({ model: m.model }))}
      endpoint="/api/ai-insight/fleet-mix-narrative"
      subjectKey={`fleet:${champion ?? "none"}:${projectionStart ?? ""}:${heavyNowPct?.toFixed(2) ?? ""}:${heavyNextPct?.toFixed(2) ?? ""}`}
      chips={
        champ ? (
          <>
            <NarrativeChip tone="good">
              <b style={{ color: "var(--text-primary)" }}>{champ.model}</b>
              {champ.maePp != null && (
                <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {champ.maePp.toFixed(2)} pp typical miss
                </span>
              )}
            </NarrativeChip>
            <NarrativeChip tone={beatsPersistence ? "good" : "neutral"}>
              <span style={{ fontWeight: 600 }}>
                {beatsPersistence ? "beats assuming the mix stays the same" : "no better than assuming the mix stays the same"}
              </span>
            </NarrativeChip>
          </>
        ) : (
          <NarrativeChip tone="neutral">No model accepted</NarrativeChip>
        )
      }
      contextLine={
        <>
          Read from the held-out scores in the table above and the projection drawn
          {projectionStart && projectionEnd && <> · projection {projectionStart} to {projectionEnd}</>}
          {staleDays != null && staleDays > 45 && <> · data ends {dataEnds}</>}
        </>
      }
      buildBody={() => ({
        models: models.map((m) => ({
          model: m.model,
          rank: m.rank,
          accepted: m.accepted,
          maePp: m.maePp,
          mape: m.mape,
          heavyWmape: m.heavyWmape,
          heavyR2: m.heavyR2,
          skill: m.skill,
          rejectedReason: m.rejectedReason,
          diagnosis: m.diagnosis,
        })),
        situation: {
          champion,
          heavyNowPct,
          heavyNextPct,
          windowDays,
          projectionDays,
          projectionStart,
          projectionEnd,
          validatedDays,
          surgeDays: surgeDates.length,
          surgeDates: surgeDates.slice(0, 10),
          dataEnds,
          staleDays,
        },
      })}
    />
  );
}
