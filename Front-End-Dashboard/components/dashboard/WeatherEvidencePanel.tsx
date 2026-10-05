"use client";

import { useEffect, useState } from "react";
import InfoTooltip from "./InfoTooltip";
import { CloudRain } from "lucide-react";

/**
 * Weather as a predictor, as one flat block inside the Validation evidence
 * disclosure.
 *
 * The chart overlays rainfall alone; this shows all four weather variables'
 * correlation with daily volume and the with/without-weather test for each
 * model that can take external inputs, so the choice of rainfall reads as a
 * display decision. Both halves come from the warehouse at request time.
 *
 * It used to be a card with its own Show/Hide button and three explanatory
 * paragraphs nested inside an already-collapsed section. Now: a label, one
 * headline line, four bars, one line per model. The explanations live in the
 * info icon.
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type Correlation = { variable: string; label: string; pearson: number | null; spearman: number | null; days: number };
type ModelComparison = { model: string; withWeather: number | null; withoutWeather: number | null; deltaPts: number | null };


/** Section heading inside the evidence area: a tinted icon tile and a bold
    title, so each block is identifiable at a glance rather than a line of
    small caps that reads as a footnote. */
export function EvidenceHeading({ icon, tint, title, children }: {
  icon: React.ReactNode; tint: string; title: string; children?: React.ReactNode;
}) {
  // Night Corridor: a hairline ring carries the icon in the block's tint, and
  // the title sits at body size, so a block heading never outranks the card's.
  return (
    <span className="nct-ev-heading">
      <span className="nct-ev-heading-icon" style={{ color: tint }}>
        {icon}
      </span>
      <span className="nct-ev-heading-title">
        {title}
        {children}
      </span>
    </span>
  );
}

export default function WeatherEvidencePanel({ plotted = "total_rain", selectedModels }: {
  plotted?: string;
  /** Labels of the models currently drawn on the chart. Only their with/without
      pairs are shown, so the block answers for what the reader is looking at. */
  selectedModels?: string[];
}) {
  const [corr, setCorr] = useState<Correlation[]>([]);
  const [models, setModels] = useState<ModelComparison[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND}/api/traffic/weather-evidence`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.success) return setState("error");
        setCorr(j.data.correlations ?? []);
        setModels(j.data.modelComparison ?? []);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => { cancelled = true; };
  }, []);

  if (state !== "ready") return null;

  const days = corr[0]?.days ?? null;

  // Plain words for a correlation, the way a stakeholder would say it.
  const linkWord = (r: number | null) => {
    const a = Math.abs(r ?? 0);
    if (r == null) return "no data";
    if (a < 0.1) return "almost none";
    if (a < 0.3) return "weak";
    if (a < 0.5) return "moderate";
    return "strong";
  };
  // The word carries the grade; ink weight backs it up. Status colours are for
  // road state and pass/fail only, so a correlation is not painted green.
  const linkTone = (r: number | null) => {
    const a = Math.abs(r ?? 0);
    return a < 0.1 ? "var(--text-muted)" : a < 0.5 ? "var(--text-secondary)" : "var(--text-primary)";
  };

  // The models on the chart, if any of them were tested; otherwise all tested.
  const shown = (() => {
    const pick = selectedModels?.length ? models.filter((m) => selectedModels.includes(m.model)) : [];
    return pick.length ? pick : models;
  })();
  const helped = shown.filter((m) => (m.deltaPts ?? 0) > 0.05).length;
  const best = shown.reduce<ModelComparison | null>((acc, m) => (m.deltaPts != null && (acc == null || m.deltaPts > (acc.deltaPts ?? 0)) ? m : acc), null);
  const verdict =
    shown.length === 0 ? "Weather inputs were not tested for the models on the chart."
    : helped === 0 ? "No. Adding weather data does not make this forecast more accurate."
    : shown.length === 1 ? `A little. With weather data, ${best!.model}'s error drops from ${best!.withoutWeather?.toFixed(2)}% to ${best!.withWeather?.toFixed(2)}%.`
    : helped === shown.length ? `A little. Weather data makes every model on the chart slightly more accurate; ${best!.model} gains the most.`
    : `Only for some. Weather data helps ${helped} of ${shown.length} models on the chart; ${best!.model} gains the most.`;

  const maxErr = Math.max(...shown.flatMap((m) => [m.withWeather ?? 0, m.withoutWeather ?? 0]), 0.001);

  return (
    <section className="nct-weather">
      <EvidenceHeading icon={<CloudRain size={14} strokeWidth={2.2} />} tint="var(--nct-rain)" title="Does weather change the forecast?">
        <InfoTooltip text={`The same model trained with and without weather inputs, compared on held-out error; lower is better. The chips grade how closely each daily weather variable moves with daily corridor volume${days ? ` over ${days.toLocaleString()} days` : ""}; hover one for the correlation. Holt-Winters and Holts Linear take no external inputs, so they are not tested. Rainfall is the variable drawn on the chart because it is the easiest to read.`} />
      </EvidenceHeading>

      <p className="nct-weather-verdict">
        {verdict}
      </p>

      <div className="nct-weather-grid">
      {shown.length > 0 && (
        <div className="nct-weather-models">
          {shown.map((m) => {
            const d = m.deltaPts;
            const helps = d != null && d > 0.05;
            const hurts = d != null && d < -0.05;
            const tone = helps ? "var(--color-success)" : hurts ? "var(--color-danger)" : "var(--text-muted)";
            const bar = (v: number | null, color: string, label: string) => (
              <div className="nct-weather-bar">
                <span className="nct-weather-bar-label">{label}</span>
                <span className="nct-weather-track">
                  <span style={{ width: `${((v ?? 0) / maxErr) * 100}%`, background: color }} />
                </span>
                <span className="nct-weather-bar-value">{v == null ? "—" : `${v.toFixed(2)}%`}</span>
              </div>
            );
            return (
              <div key={m.model} className="nct-weather-model">
                {shown.length > 1 && (
                  <div className="nct-weather-model-head">
                    <b>{m.model}</b>
                    <b style={{ color: tone }}>
                      {d == null ? "—" : helps ? `${d.toFixed(2)} pts better with weather` : hurts ? `${Math.abs(d).toFixed(2)} pts worse with weather` : "no difference"}
                    </b>
                  </div>
                )}
                {bar(m.withWeather, "var(--nct-rain)", "Error with weather")}
                {bar(m.withoutWeather, "var(--nct-neutral-bar)", "Error without")}
              </div>
            );
          })}
          <div className="nct-caption">Shorter bar = more accurate.</div>
        </div>
      )}

      {/* The four weather signals, graded in words. */}
      <div className="nct-weather-signals">
        <span className="nct-weather-signals-title">How much each weather signal moves with traffic</span>
        <div className="nct-chip-row">
        {corr.map((c) => (
          <span
            key={c.variable}
            title={`Correlation with daily volume r = ${c.pearson == null ? "—" : c.pearson.toFixed(3)}`}
            className="nct-mini-chip"
          >
            <b>{c.label}</b>
            <span style={{ color: linkTone(c.pearson), fontWeight: 600 }}>{linkWord(c.pearson)}</span>
            {c.variable === plotted && <span className="nct-mini-tag">on chart</span>}
          </span>
        ))}
        </div>
      </div>
      </div>
    </section>
  );
}
