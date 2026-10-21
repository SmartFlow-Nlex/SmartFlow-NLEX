import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

/* Account emails sent by this server, from "Navie (SmartFlow NLEX)" (19 Oct 2026, user request).
 *
 * The sender is whatever SMTP account is configured (SMTP_* in the git-ignored .env): use the same
 * mailbox Supabase is set to send its own emails from (Authentication -> SMTP Settings), so the reset
 * code and these notices come from one sender. The picture beside the sender in an inbox is that
 * mailbox's own profile photo (assets/navie-avatar.png is the mascot, sized for it); inside the message
 * the mascot is attached inline, so it shows without the reader loading remote images.
 *
 * With no SMTP configured nothing is sent and the caller is told so; nothing else depends on email.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MASCOT = resolve(here, "../../assets/navie-email.png");

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function transport(): Transporter | null {
  if (!mailConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/* The shared layout (19 Oct 2026, user request): the first version's top -- Navie in a round frame
 * (assets/navie-email.png, the police-car Navie from police_car_mascot.png on a soft gradient with a ring and a shadow, baked into the
 * picture so no email client can drop it), the name and a centred heading -- then the facts as quick rows and
 * a one-row "wasn't you?" call-out with its button, so the message reads at a glance. Inline styles only,
 * because that is what email clients reliably draw. */
type EmailParts = {
  heading: string;
  intro: string;
  facts: [string, string][];
  /** The main action, as a centred button under the facts. */
  cta?: { text: string; href: string };
  callout?: { title: string; body: string; button?: { text: string; href: string } };
  footnote: string;
};

function frame(e: EmailParts): string {
  const facts = e.facts
    .map(
      ([k, v], i) => `<tr>
<td style="padding:11px 0;${i ? "border-top:1px solid #e3ebfa;" : ""}font-size:12.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#55688f;white-space:nowrap;padding-right:14px">${esc(k)}</td>
<td align="right" style="padding:11px 0;${i ? "border-top:1px solid #e3ebfa;" : ""}font-size:14.5px;font-weight:600;color:#0f1d3a">${v}</td>
</tr>`,
    )
    .join("");
  const callout = e.callout
    ? `<tr><td style="padding:14px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7e8;border:1px solid #f3d9a4;border-radius:14px"><tr>
<td style="padding:13px 16px;font-size:14px;line-height:1.45;color:#6b5320"><b style="color:#7a4b00">${esc(e.callout.title)}</b> ${e.callout.body}</td>
${e.callout.button ? `<td align="right" style="padding:13px 16px 13px 0;white-space:nowrap"><a href="${esc(e.callout.button.href)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1f5fe0;color:#ffffff;font-size:12.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none">${esc(e.callout.button.text)}</a></td>` : ""}
</tr></table></td></tr>`
    : "";
  return `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#eef4ff;font-family:'Segoe UI',Arial,sans-serif;color:#1b2a4a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4ff;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:20px;border:1px solid #dbe6fb">
<tr><td align="center" style="padding:28px 32px 6px"><img src="cid:navie" width="112" height="112" alt="Navie, the SmartFlow NLEX mascot" style="display:block;border:0"></td></tr>
<tr><td align="center" style="padding:4px 32px 0;font-size:12.5px;font-weight:700;letter-spacing:3px;color:#1a4fc0">NAVIE &middot; SMARTFLOW NLEX</td></tr>
<tr><td align="center" style="padding:12px 32px 0;font-size:22px;line-height:1.25;font-weight:700;color:#0f1d3a">${esc(e.heading)}</td></tr>
<tr><td align="center" style="padding:6px 32px 0;font-size:15px;line-height:1.5;color:#41557d">${e.intro}</td></tr>
<tr><td style="padding:18px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9ff;border:1px solid #e1eafb;border-radius:14px">
<tr><td style="padding:2px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts}</table></td></tr>
</table></td></tr>
${e.cta ? `<tr><td align="center" style="padding:18px 32px 0"><a href="${esc(e.cta.href)}" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#1f5fe0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none">${esc(e.cta.text)}</a></td></tr>` : ""}
${callout}
<tr><td style="padding:20px 32px 24px;font-size:13px;line-height:1.5;color:#5a6b8c">${e.footnote}</td></tr>
</table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  let mascot: Buffer | null = null;
  try {
    mascot = readFileSync(MASCOT);
  } catch {
    mascot = null;
  }
  await t.sendMail({
    from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_EMAIL ?? (env.SMTP_USER as string) },
    to,
    subject,
    html,
    text,
    attachments: mascot ? [{ filename: "navie.png", content: mascot, cid: "navie" }] : [],
  });
  return true;
}

const fmt = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** "Your password was changed", with the date it can next be changed. */
export async function sendPasswordChanged(to: string, changedAt: Date, nextAllowed: Date, how: "settings" | "reset"): Promise<boolean> {
  const { subject, html, text } = renderPasswordChanged(to, changedAt, nextAllowed, how);
  return send(to, subject, html, text);
}

/** The same email as data, for sending and for previewing. */
export function renderPasswordChanged(to: string, changedAt: Date, nextAllowed: Date, how: "settings" | "reset") {
  const heading = "Your password was changed";
  const howText = how === "reset" ? "Reset by email link" : "Changed in Settings";
  const short = (d: Date) => d.toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const shortDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const html = frame({
    heading,
    intro: `The password for <b style="color:#0f1d3a">${esc(to)}</b> was just changed.`,
    facts: [
      ["Changed", `${esc(short(changedAt))} PHT`],
      ["How", esc(howText)],
      ["Next change allowed", esc(shortDay(nextAllowed))],
      ["Remembered devices", "Will ask for the code again"],
    ],
    callout: {
      title: "Wasn't you?",
      body: "Contact your administrator right away; they can reset it for you.",
    },
    footnote: "Sent by Navie for SmartFlow NLEX whenever your password changes. Please don&rsquo;t reply.",
  });
  const text = [
    heading,
    `The password for ${to} was just changed.`,
    `Changed: ${fmt(changedAt)} (Philippine time)`,
    `How: ${howText}`,
    `Next change allowed: ${fmtDay(nextAllowed)}`,
    `Remembered devices will ask for the authenticator code again.`,
    `Wasn't you? Contact your administrator right away; they can reset it for you.`,
  ].join("\n");
  return { subject: "Your SmartFlow NLEX password was changed", html, text };
}

/** The password-reset email: a link to the sign-in page, which carries on to the new password (no code). */
export function renderPasswordReset(to: string, link: string) {
  const heading = "Reset your password";
  const html = frame({
    heading,
    intro: `Someone asked to reset the password for <b style="color:#0f1d3a">${esc(to)}</b>. If it was you, use the button below.`,
    facts: [
      ["Open it in", "The same browser you asked from"],
      ["Works", "Once, and only for a short time"],
    ],
    cta: { text: "Reset password", href: link },
    callout: { title: "Didn't ask for this?", body: "Ignore this email. Your password stays as it is." },
    footnote: "Sent by Navie for SmartFlow NLEX. Please don&rsquo;t reply.",
  });
  const text = [
    heading,
    `Someone asked to reset the password for ${to}. If it was you, open this link in the same browser:`,
    link,
    `It works once and only for a short time. Didn't ask for this? Ignore this email; your password stays as it is.`,
  ].join("\n");
  return { subject: "Reset your SmartFlow NLEX password", html, text };
}

export async function sendPasswordReset(to: string, link: string): Promise<boolean> {
  const { subject, html, text } = renderPasswordReset(to, link);
  return send(to, subject, html, text);
}

/* Sent instead of a reset link while the account is inside its 30-day wait after a password change
   (19 Oct 2026, user request): it says when the password was changed and when the next change is allowed. */
export function renderResetRefused(to: string, changedAt: Date, nextAllowed: Date) {
  const heading = "You changed your password recently";
  const short = (d: Date) => d.toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const shortDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const html = frame({
    heading,
    intro: `Someone asked to reset the password for <b style="color:#0f1d3a">${esc(to)}</b>, but it was changed less than 30 days ago, so no reset link was sent.`,
    facts: [
      ["Last changed", `${esc(short(changedAt))} PHT`],
      ["Next change allowed", esc(shortDay(nextAllowed))],
      ["Reset requested", `${esc(short(new Date()))} PHT`],
    ],
    callout: {
      title: "Can't sign in?",
      body: "Contact your administrator; they can reset it for you. Didn't ask for a reset? You can ignore this email.",
    },
    footnote: "Sent by Navie for SmartFlow NLEX. For your security, a password can be changed once every 30 days. Please don&rsquo;t reply.",
  });
  const text = [
    heading,
    `Someone asked to reset the password for ${to}, but it was changed less than 30 days ago, so no reset link was sent.`,
    `Last changed: ${fmt(changedAt)} (Philippine time)`,
    `Next change allowed: ${fmtDay(nextAllowed)}`,
    `Can't sign in? Contact your administrator; they can reset it for you. Didn't ask for a reset? Ignore this email.`,
  ].join("\n");
  return { subject: "Your SmartFlow NLEX password was changed recently", html, text };
}

export async function sendResetRefused(to: string, changedAt: Date, nextAllowed: Date): Promise<boolean> {
  const { subject, html, text } = renderResetRefused(to, changedAt, nextAllowed);
  return send(to, subject, html, text);
}

