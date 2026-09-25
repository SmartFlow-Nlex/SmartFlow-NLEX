import re

with open('Front-End-Dashboard/app/dashboard/incident/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Type definitions and labels
content = re.sub(r'const SOURCE_LABEL: Record<"road" \| "moto" \| "stalled", string> = {[^}]+};', 
                 'const SOURCE_LABEL: Record<"accident" | "breakdown", string> = {\n  accident: "Accidents",\n  breakdown: "Breakdowns",\n};', 
                 content)

content = content.replace('dailyTrend: { d: string; road: number; moto: number; stalled: number }[];', 
                          'dailyTrend: { d: string; accident: number; breakdown: number }[];')

content = content.replace('hotspots: { km_bin: number; total: number; road: number; moto: number; stalled: number; injuries: number; fatalities: number }[];', 
                          'hotspots: { km_bin: number; total: number; accident: number; breakdown: number; injuries: number; fatalities: number }[];')

content = content.replace('incidents: { wet: Record<"road" | "moto" | "stalled", number>; dry: Record<"road" | "moto" | "stalled", number> };',
                          'incidents: { wet: Record<"accident" | "breakdown", number>; dry: Record<"accident" | "breakdown", number> };')

content = content.replace('type SourceFilter = "all" | "road" | "moto" | "stalled";',
                          'type SourceFilter = "all" | "accident" | "breakdown";')

# 2. KPI derivations (rain multiplier)
content = content.replace('const wetCrashes = weather.incidents.wet.road + weather.incidents.wet.moto;',
                          'const wetCrashes = weather.incidents.wet.accident;')
content = content.replace('const dryCrashes = weather.incidents.dry.road + weather.incidents.dry.moto;',
                          'const dryCrashes = weather.incidents.dry.accident;')

# 3. Trend calculations
content = content.replace('type TrendRow = { label: string; road: number; moto: number; stalled: number; total: number };',
                          'type TrendRow = { label: string; accident: number; breakdown: number; total: number };')

content = content.replace('const acc = new Map<string, { road: number; moto: number; stalled: number }>();',
                          'const acc = new Map<string, { accident: number; breakdown: number }>();')

content = content.replace('const cur = acc.get(k) ?? { road: 0, moto: 0, stalled: 0 };',
                          'const cur = acc.get(k) ?? { accident: 0, breakdown: 0 };')

content = content.replace('acc.set(k, { road: cur.road + r.road, moto: cur.moto + r.moto, stalled: cur.stalled + r.stalled });',
                          'acc.set(k, { accident: cur.accident + r.accident, breakdown: cur.breakdown + r.breakdown });')

content = content.replace('.map(([label, v]) => ({ label, ...v, total: v.road + v.moto + v.stalled }));',
                          '.map(([label, v]) => ({ label, ...v, total: v.accident + v.breakdown }));')

# 4. Small multiples configuration
panels_old = """      const PANELS = [
        { name: "Road crashes", key: "road" as const, color: TYPE_HUES[0] },
        { name: "Motorcycle crashes", key: "moto" as const, color: TYPE_HUES[1] },
        { name: "Stalled vehicles", key: "stalled" as const, color: TYPE_HUES[2] },
      ];"""
panels_new = """      const PANELS = [
        { name: "Accidents", key: "accident" as const, color: TYPE_HUES[0] },
        { name: "Breakdowns", key: "breakdown" as const, color: TYPE_HUES[2] },
      ];"""
content = content.replace(panels_old, panels_new)

# 5. Type filter options
source_opts_old = """                { label: "Road crashes", value: "road" },
                { label: "Motorcycle crashes", value: "moto" },
                { label: "Stalled vehicles", value: "stalled" },"""
source_opts_new = """                { label: "Accidents", value: "accident" },
                { label: "Breakdowns", value: "breakdown" },"""
content = content.replace(source_opts_old, source_opts_new)


# 6. Table row headings and data
th_old = '<tr><th>#</th><th>Segment</th><th>Total</th><th>Road</th><th>Moto</th><th>Stalled</th><th>Injured</th><th>Fatal</th></tr>'
th_new = '<tr><th>#</th><th>Segment</th><th>Total</th><th>Accident</th><th>Breakdown</th><th>Injured</th><th>Fatal</th></tr>'
content = content.replace(th_old, th_new)

td_old = """                      <td className={styles.plazaNum}>{fmtInt(r.road)}</td>
                      <td className={styles.plazaNum}>{fmtInt(r.moto)}</td>
                      <td className={styles.plazaNum}>{fmtInt(r.stalled)}</td>"""
td_new = """                      <td className={styles.plazaNum}>{fmtInt(r.accident)}</td>
                      <td className={styles.plazaNum}>{fmtInt(r.breakdown)}</td>"""
content = content.replace(td_old, td_new)


# Add breakdown tooltip text updates
content = content.replace('"Incident counts over the selected Range, by type (road crashes, motorcycle crashes, stalled vehicles). Daily, weekly, or monthly',
                          '"Incident counts over the selected Range, by type (accidents, breakdowns). Daily, weekly, or monthly')


with open('Front-End-Dashboard/app/dashboard/incident/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
