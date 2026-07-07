import crypto from 'crypto';
import tls from 'tls';
import { getFrontendUrl } from '../utils/frontendUrl';

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const AMAZE_SMS_TIMEOUT_MS = Number(process.env.AMAZE_SMS_TIMEOUT_MS || 45000);

export const getOtpExpiry = () => new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

export const generateOtp = () => crypto.randomInt(100000, 999999).toString();

export const hashOtp = (otp: string) =>
  crypto
    .createHash('sha256')
    .update(`${otp}:${process.env.JWT_SECRET || 'otp-secret'}`)
    .digest('hex');

export const verifyOtpHash = (otp: string, hash: string) => hashOtp(otp) === hash;

export async function sendAmazeSmsOtp(phoneNumber: string, otp: string): Promise<void> {
  const baseUrl = process.env.AMAZE_SMS_BASE_URL || 'https://api.amazesms.com/api/sms';
  const apiKey = process.env.AMAZE_SMS_API_KEY;
  if (!apiKey) {
    console.warn('AMAZE_SMS_API_KEY missing; SMS OTP skipped');
    return;
  }

  const body = `Your OTP for Karhari Media Distribution Login is ${otp}. It is valid for ${OTP_TTL_MINUTES} minutes. Do not share this OTP.`;
  const url = new URL(baseUrl);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('from', process.env.AMAZE_SMS_SENDER_ID || 'SNGLAU');
  url.searchParams.set('to', phoneNumber);
  url.searchParams.set('body', body);
  url.searchParams.set('templateid', process.env.AMAZE_SMS_TEMPLATE_ID || '1007380632079936419');
  url.searchParams.set('entityid', process.env.AMAZE_SMS_ENTITY_ID || '1001529360956910382');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AMAZE_SMS_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Amaze SMS failed with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Amaze SMS timed out after ${AMAZE_SMS_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readSmtpResponse(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk.toString('utf8'));
      const text = chunks.join('');
      const lines = text.trim().split(/\r?\n/);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3}\s/.test(last)) {
        socket.off('data', onData);
        resolve(text);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

async function smtpCommand(socket: tls.TLSSocket, command: string) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!/^(2|3)\d{2}/.test(response)) {
    throw new Error(`SMTP command failed: ${response.trim()}`);
  }
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getLogoUrl = () => `${getFrontendUrl()}/images/karhari-media-b1.png`;
const getHelpCenterUrl = () => `${getFrontendUrl()}/help`;

function renderBasicEmail(subject: string, text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(
      part =>
        `<p style="margin:0 0 14px;color:#4d4350;font:500 16px/1.65 Arial,sans-serif">${escapeHtml(part).replace(/\n/g, '<br />')}</p>`
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#ffffff;color:#171018">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:26px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #eadff0;box-shadow:0 18px 45px rgba(28,18,34,.12)">
                <tr>
                  <td style="padding:28px 36px;background:linear-gradient(135deg,#13061f 0%,#26123a 54%,#00e7ff 135%);color:#ffffff;border-bottom:4px solid #00e7ff">
                    <img src="${escapeHtml(getLogoUrl())}" alt="Karhari Media Distribution" width="228" draggable="false" style="display:block;max-width:228px;height:auto;margin:0;pointer-events:none;user-select:none" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:38px 40px 30px">
                    <h1 style="margin:0 0 14px;color:#171018;font:900 30px/1.15 Arial,sans-serif;letter-spacing:-.01em">${escapeHtml(subject)}</h1>
                    ${paragraphs}
                    <p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #f0e6ee;color:#8d808c;font:500 12px/1.6 Arial,sans-serif">Need help? Visit <a href="${escapeHtml(getHelpCenterUrl())}" style="color:#d6d70d;text-decoration:none;font-weight:800">Karhari Media Distribution Help Center</a>.</p>
                    <p style="margin:6px 0 0;color:#aaa0aa;font:400 11px/1.5 Arial,sans-serif">Copyright ${new Date().getFullYear()} Karhari Media Distribution. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function renderOtpEmail(otp: string) {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#ffffff;color:#171018">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:26px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #eadff0;box-shadow:0 18px 45px rgba(28,18,34,.12)">
                <tr>
                  <td style="padding:28px 36px;background:linear-gradient(135deg,#13061f 0%,#26123a 54%,#00e7ff 135%);color:#ffffff;border-bottom:4px solid #00e7ff">
                    <img src="${escapeHtml(getLogoUrl())}" alt="Karhari Media Distribution" width="228" draggable="false" style="display:block;max-width:228px;height:auto;margin:0;pointer-events:none;user-select:none" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:38px 40px 30px">
                    <p style="margin:0 0 10px;color:#d6d70d;font:900 12px Arial,sans-serif;text-transform:uppercase;letter-spacing:.12em">Secure verification</p>
                    <h1 style="margin:0 0 14px;color:#171018;font:900 30px/1.15 Arial,sans-serif;letter-spacing:-.01em">Your Karhari Media Distribution OTP</h1>
                    <p style="margin:0 0 22px;color:#4d4350;font:500 16px/1.65 Arial,sans-serif">Use this code to finish verification. It expires in ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin:0 0 22px">
                      <tr>
                        <td style="padding:18px 24px;border-radius:18px 0 0 18px;background:#fbf7ff;border:1px solid #eadff0;color:#171018;font:900 34px/1 Arial,sans-serif;letter-spacing:.28em;user-select:all">${escapeHtml(otp)}</td>
                        <td style="padding:18px 20px;border-radius:0 18px 18px 0;background:linear-gradient(135deg,#00e7ff,#d6d70d);color:#ffffff;font:900 13px Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em">Copy this code</td>
                      </tr>
                    </table>
                    <p style="margin:0;color:#8d808c;font:500 13px/1.6 Arial,sans-serif">Tip: select the OTP above and copy it into the signup form.</p>
                    <p style="margin:32px 0 0;padding-top:18px;border-top:1px solid #f0e6ee;color:#8d808c;font:500 12px/1.6 Arial,sans-serif">Need help? Visit <a href="${escapeHtml(getHelpCenterUrl())}" style="color:#d6d70d;text-decoration:none;font-weight:800">Karhari Media Distribution Help Center</a>.</p>
                    <p style="margin:6px 0 0;color:#aaa0aa;font:400 11px/1.5 Arial,sans-serif">Copyright ${new Date().getFullYear()} Karhari Media Distribution. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendEmailMessage(
  email: string,
  subject: string,
  text: string,
  html?: string
): Promise<void> {
  const user = process.env.SMTP_GMAIL_USER;
  const pass = process.env.SMTP_GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn('SMTP Gmail env missing; email skipped');
    return;
  }

  const socket = tls.connect(465, 'smtp.gmail.com');
  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  await readSmtpResponse(socket);
  await smtpCommand(socket, 'EHLO karharimedia.local');
  await smtpCommand(socket, 'AUTH LOGIN');
  await smtpCommand(socket, Buffer.from(user).toString('base64'));
  await smtpCommand(socket, Buffer.from(pass).toString('base64'));
  await smtpCommand(socket, `MAIL FROM:<${user}>`);
  await smtpCommand(socket, `RCPT TO:<${email}>`);
  await smtpCommand(socket, 'DATA');

  const bodyHtml = html || renderBasicEmail(subject, text);
  const message = [
    `From: Karhari Media Distribution <${user}>`,
    `To: ${email}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    bodyHtml,
    '.',
  ].join('\r\n');
  socket.write(`${message}\r\n`);
  await readSmtpResponse(socket);
  socket.write('QUIT\r\n');
  socket.end();
}

export async function sendEmailOtp(email: string, otp: string): Promise<void> {
  return sendEmailMessage(
    email,
    'Your Karhari Media Distribution verification code',
    `Your OTP for Karhari Media Distribution is ${otp}. It is valid for ${OTP_TTL_MINUTES} minutes. Do not share this OTP.`,
    renderOtpEmail(otp)
  );
}
