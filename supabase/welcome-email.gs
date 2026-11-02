/*
 * SmartFlow NLEX - the welcome email a new account gets.
 *
 * A Google Apps Script that runs as navie.smartflow@gmail.com, so the email
 * really comes from that inbox. It lives here, not in the backend, because
 * Render's free tier blocks outgoing email connections, and Supabase's mailer
 * only sends its own sign-in templates. No password or API key is needed.
 *
 * SETUP, once, signed in to Google as navie.smartflow@gmail.com:
 *   1. https://script.google.com -> New project. Replace everything in Code.gs
 *      with this file, then save.
 *   2. Deploy -> New deployment -> gear icon -> Web app.
 *      Execute as: Me. Who has access: Anyone. Then Deploy.
 *   3. Authorize access. Google warns the app is unverified, because it is your
 *      own: Advanced -> Go to the project -> Allow.
 *   4. Copy the Web app URL (it ends in /exec) into the repo root's .env:
 *        EXPO_PUBLIC_WELCOME_EMAIL_URL=<the URL>
 *      then restart the Expo server.
 *
 * After changing this file: Deploy -> Manage deployments -> edit -> New version.
 * The URL stays the same. A Gmail account can send to 100 recipients a day.
 *
 * "Anyone" only means the URL needs no Google sign-in. A caller must present a
 * real session token from our Supabase project, and the email only ever goes to
 * the address on that account, once, and only while the account is new. So this
 * cannot be used to send mail to a chosen address, or to send any chosen words.
 */

const SUPABASE_URL = 'https://jzkghkoaojdkusbjttgw.supabase.co';
const NAVIE_IMAGE = `${SUPABASE_URL}/storage/v1/object/public/Mascot/navie-email.png`;
/** Long enough for a slow network; short enough that an old account is never welcomed. */
const NEW_ACCOUNT_MS = 15 * 60 * 1000;

function doPost(e) {
  try {
    return reply(welcome(JSON.parse(e.postData.contents)));
  } catch (error) {
    // The message only: the request holds the user's session token.
    console.error(`Welcome email failed: ${error.message}`);
    return reply({ sent: false, reason: 'error' });
  }
}

function reply(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function welcome({ token, apikey }) {
  if (typeof token !== 'string' || typeof apikey !== 'string') {
    return { sent: false, reason: 'bad-request' };
  }

  // Whose token is this? Supabase's answer, never the caller's, says who to write to.
  const answer = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey, Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });
  if (answer.getResponseCode() !== 200) {
    return { sent: false, reason: 'not-signed-in' };
  }
  const user = JSON.parse(answer.getContentText());
  if (typeof user.email !== 'string' || user.email.length === 0) {
    return { sent: false, reason: 'no-email' };
  }
  if (!(Date.now() - new Date(user.created_at).getTime() < NEW_ACCOUNT_MS)) {
    return { sent: false, reason: 'not-new' };
  }

  // Locked, so two calls at once cannot both find it unsent.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sent = PropertiesService.getScriptProperties();
    const key = `welcomed:${user.id}`;
    if (sent.getProperty(key) !== null) {
      return { sent: false, reason: 'already-sent' };
    }
    const name = String((user.user_metadata && user.user_metadata.full_name) || '').trim();
    MailApp.sendEmail({
      to: user.email,
      subject: 'Welcome to SmartFlow NLEX',
      name: 'SmartFlow NLEX',
      body: plainMessage(name, user.email),
      htmlBody: htmlMessage(name, user.email),
    });
    sent.setProperty(key, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
  return { sent: true };
}

const FEATURES = [
  'Check the live status of each NLEX exit on the Corridor tab',
  'See road alerts as they are reported on the Alerts tab',
  'Read and share updates from other drivers on the Community tab',
  'Ask Navie, your traffic assistant, about conditions on NLEX',
];

function plainMessage(name, email) {
  return [
    name.length > 0 ? `Hi ${name},` : 'Hi,',
    '',
    `Your SmartFlow NLEX account for ${email} has been created. Welcome aboard!`,
    '',
    'Each time you sign in, you will enter your password and the six-digit code from your authenticator app.',
    '',
    'In the app you can:',
    ...FEATURES.map((feature) => `- ${feature}`),
    '',
    'If you did not create this account, please reply to this email and let us know.',
    '',
    'SmartFlow NLEX',
  ].join('\n');
}

function htmlMessage(name, email) {
  const greeting = name.length > 0 ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const features = FEATURES.map((feature) => `<li style="margin:0 0 6px;">${escapeHtml(feature)}</li>`).join('');
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4FAFF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FAFF;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;font-family:Arial,Helvetica,sans-serif;color:#10284C;">
            <tr>
              <td align="center" style="padding:28px 28px 0;">
                <img src="${NAVIE_IMAGE}" alt="Navie, the SmartFlow NLEX mascot" width="140" style="display:block;width:140px;max-width:100%;height:auto;" />
                <h1 style="margin:16px 0 0;font-size:24px;line-height:30px;color:#1464E8;">Welcome to SmartFlow NLEX</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;font-size:15px;line-height:23px;">
                <p style="margin:0 0 14px;">${greeting}</p>
                <p style="margin:0 0 14px;">Your account for <strong>${escapeHtml(email)}</strong> has been created. Welcome aboard!</p>
                <p style="margin:0 0 14px;">Each time you sign in, you will enter your password and the six-digit code from your authenticator app.</p>
                <p style="margin:0 0 8px;">In the app you can:</p>
                <ul style="margin:0 0 14px;padding-left:20px;">${features}</ul>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 26px;font-size:13px;line-height:20px;color:#5B6B82;">
                If you did not create this account, please reply to this email and let us know.
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#5B6B82;">&copy; ${new Date().getFullYear()} SmartFlow NLEX. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
