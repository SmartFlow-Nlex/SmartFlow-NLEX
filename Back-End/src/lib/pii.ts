/**
 * Mask personal details in free text before it leaves for the AI provider (security audit #15, 9 Nov 2026).
 *
 * The sandbox command box is the one place a person's own words reach the model. The command parser needs exits,
 * kilometres, lanes and times, never contact details, so emails, Philippine mobile numbers and plate-style codes are
 * replaced with a placeholder first. Plates are matched only in capitals (ABC 1234), the way they are written, so
 * ordinary words such as "for 2000 vehicles" are left alone. Names cannot be detected reliably and are not attempted.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PH_MOBILE = /(?:\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
const PLATE = /\b[A-Z]{3}[ -]?\d{3,4}\b/g;

export function maskPersonalDetails(text: string): { text: string; masked: number } {
  let masked = 0;
  const out = text
    .replace(EMAIL, () => { masked++; return "[email]"; })
    .replace(PH_MOBILE, () => { masked++; return "[phone]"; })
    .replace(PLATE, () => { masked++; return "[plate]"; });
  return { text: out, masked };
}
