import type { ThemePalette } from '../theme';
import type { AlertTone } from './AlertsProvider';

/**
 * Alert tints come from the palette so they stay legible in both themes.
 * Shared by the Alerts screen and the in-app banner, so an alert looks the
 * same in both places.
 */
export function alertTone(
  tone: AlertTone,
  c: ThemePalette,
): { solid: string; background: string; text: string } {
  if (tone === 'critical') {
    return { solid: c.statusHeavySolid, background: c.statusHeavyBg, text: c.statusHeavyText };
  }
  // An operator-published notice at the lowest level. Brand blue rather than a
  // third warm tint: red and orange already mean "act", and a third shade of
  // orange would read as a severity between them instead of below both.
  if (tone === 'info') {
    return { solid: c.primary, background: c.primarySoft, text: c.primaryDark };
  }
  return { solid: c.statusHighSolid, background: c.statusHighBg, text: c.statusHighText };
}
