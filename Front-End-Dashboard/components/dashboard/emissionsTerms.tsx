/* Full names for the pollutant abbreviations the Emissions tab prints (17 Oct 2026, testers EM-10: "full
   pollutant name on hover"). <Term> is for HTML text; spelled() is for ECharts tooltips and labels, which
   draw on a canvas or in a tooltip string and cannot carry an <abbr>. These are the only abbreviations the
   tab shows: CO2 is the modelled record, NO2 and PM2.5 come from the per-class factors, and AQI is the
   measured OpenWeatherMap index. */

export const POLLUTANT_NAMES = {
  "CO₂": "Carbon dioxide",
  "NO₂": "Nitrogen dioxide",
  "PM2.5": "Fine particulate matter: particles 2.5 micrometres across or smaller",
  AQI: "Air Quality Index: OpenWeatherMap's 1 (good) to 5 (very poor) scale",
} as const;

export type PollutantCode = keyof typeof POLLUTANT_NAMES;

/** The abbreviation, with its full name on hover. */
export function Term({ t }: { t: PollutantCode }) {
  return (
    <abbr className="nc-em-abbr" title={POLLUTANT_NAMES[t]}>
      {t}
    </abbr>
  );
}

/** "NO₂ · nitrogen dioxide", for text drawn by a chart. */
export const spelled = (t: PollutantCode) => `${t} · ${POLLUTANT_NAMES[t].split(":")[0].toLowerCase()}`;
