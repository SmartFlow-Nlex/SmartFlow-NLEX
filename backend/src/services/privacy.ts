/**
 * Personal details taken out of what is sent to the language model.
 *
 * Navie never needs an email address, a phone number or a long account or card
 * number to answer a traffic question, so they are replaced before the text
 * leaves this server - in the user's message and in the earlier turns sent with
 * it. The user still sees their own words in the app; only the model's copy is
 * masked. Exit names, dates, times and speeds are left alone.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Philippine mobile numbers: 09xx xxx xxxx, +63 9xx xxx xxxx, with or without spaces or dashes. */
const PH_MOBILE = /(?<!\d)(?:\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;
/** Landlines written with an area code in brackets: (02) 8123 4567. */
const LANDLINE = /\(0\d{1,2}\)\s?\d{3,4}[\s-]?\d{4}/g;
/** 12-19 digits in a row: card, account or ID numbers. Years and speeds are far shorter. */
const LONG_NUMBER = /(?<!\d)\d{12,19}(?!\d)/g;

export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, '[email removed]')
    .replace(PH_MOBILE, '[phone number removed]')
    .replace(LANDLINE, '[phone number removed]')
    .replace(LONG_NUMBER, '[number removed]');
}
