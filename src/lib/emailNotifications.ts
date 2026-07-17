import tls from 'tls';
import { Db } from 'mongodb';
import { getDspMeta } from '@/lib/platforms';
import type { ReleasePolicyAcceptances } from '@/lib/releaseConsent';

type Recipient = {
  email?: string;
  name?: string;
};

type ActionEmail = {
  subject: string;
  title: string;
  intro: string;
  details?: Record<string, string | number | undefined | null>;
  release?: ReleaseEmailSummary;
  actionLabel?: string;
  actionUrl?: string;
};

type ReleaseEmailSummary = {
  title?: string;
  coverUrl?: string;
  artist?: string;
  label?: string;
  genre?: string;
  releaseDate?: string;
  upc?: string;
  status?: string;
  tracks?: Array<{ title?: string; duration?: string; primaryArtist?: string; artist?: string }>;
  stores?: string[];
  policyAcceptances?: ReleasePolicyAcceptances;
};

const getFrontendUrl = () => {
  const host = process.env.NEXT_PUBLIC_APP_HOST || process.env.APP_HOST || '';
  const configured =
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (host ? `https://${host.replace(/^https?:\/\//, '')}` : '');

  return (configured || `http://${'localhost'}:${process.env.FRONTEND_PORT || 3000}`).replace(/\/$/, '');
};
const getLogoUrl = () => `${getFrontendUrl()}/images/karhari-media-b1.png`;
const getHelpCenterUrl = () => `${getFrontendUrl()}/help`;
const absoluteUrl = (value?: string) => {
  if (!value) return '';
  if (/^(https?:|data:)/i.test(value)) return value;
  return `${getFrontendUrl()}${value.startsWith('/') ? value : `/${value}`}`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDetailLabel = (label: string) =>
  label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const readSmtpResponse = (socket: tls.TLSSocket): Promise<string> =>
  new Promise((resolve, reject) => {
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

const smtpCommand = async (socket: tls.TLSSocket, command: string) => {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!/^(2|3)\d{2}/.test(response)) {
    throw new Error(`SMTP command failed: ${response.trim()}`);
  }
};

const renderDetails = (details?: ActionEmail['details']) => {
  const rows = Object.entries(details || {}).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== ''
  );
  if (!rows.length) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:separate;border-spacing:0;border:1px solid #e7ddea;border-radius:18px;overflow:hidden;background:#ffffff">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding:14px 16px;background:#fbf7ff;color:#6b6070;font:700 12px Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;width:38%;border-bottom:1px solid #f1e9f3">${escapeHtml(formatDetailLabel(label))}</td>
          <td style="padding:14px 16px;color:#171018;font:700 14px Arial,sans-serif;border-bottom:1px solid #f1e9f3">${escapeHtml(value)}</td>
        </tr>
      `
        )
        .join('')}
    </table>
  `;
};

const renderReleaseSummary = (release?: ReleaseEmailSummary) => {
  if (!release) return '';
  const coverUrl = absoluteUrl(release.coverUrl);
  const tracks = Array.isArray(release.tracks)
    ? release.tracks.filter(track => track?.title).slice(0, 16)
    : [];
  const stores = Array.isArray(release.stores)
    ? Array.from(new Set(release.stores.filter(Boolean)))
    : [];
  const policyAcceptances = release.policyAcceptances;
  const facts = [
    ['Artist', release.artist],
    ['Label', release.label],
    ['Genre', release.genre],
    ['Release date', release.releaseDate],
    ['UPC', release.upc],
    ['Status', release.status],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-collapse:separate;border-spacing:0">
      <tr>
        <td style="padding:16px 18px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#13061f 0%,#d6d70d 70%,#00e7ff 130%);color:#ffffff;font:900 22px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase">
          Release overview
        </td>
      </tr>
      <tr>
        <td style="padding:20px;border:1px solid #dceef7;border-top:0;border-radius:0 0 18px 18px;background:#ffffff">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${
                coverUrl
                  ? `
                <td width="148" valign="top" style="padding:0 18px 16px 0">
                  <img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(release.title || 'Release artwork')}" width="132" height="132" style="display:block;width:132px;height:132px;object-fit:cover;border-radius:14px;border:1px solid #eadff0" />
                </td>
              `
                  : ''
              }
              <td valign="top" style="padding:0 0 16px">
                <h2 style="margin:0 0 10px;color:#171018;font:900 24px/1.2 Arial,sans-serif">${escapeHtml(release.title || 'Untitled release')}</h2>
                ${facts
                  .map(
                    ([label, value]) => `
                  <p style="margin:0 0 5px;color:#4d4350;font:500 14px/1.45 Arial,sans-serif"><strong style="color:#171018">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>
                `
                  )
                  .join('')}
              </td>
            </tr>
          </table>
          ${
            tracks.length
              ? `
            <h3 style="margin:4px 0 10px;color:#171018;font:900 15px Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em">Tracks</h3>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              ${tracks
                .map(
                  (track, index) => `
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #f0e6ee;color:#8b7e8d;font:800 12px Arial,sans-serif;width:34px">${index + 1}</td>
                  <td style="padding:10px 0;border-top:1px solid #f0e6ee;color:#171018;font:800 14px Arial,sans-serif">${escapeHtml(track.title)}</td>
                  <td align="right" style="padding:10px 0;border-top:1px solid #f0e6ee;color:#8b7e8d;font:600 12px Arial,sans-serif">${escapeHtml(track.duration || track.primaryArtist || track.artist || '')}</td>
                </tr>
              `
                )
                .join('')}
            </table>
          `
              : ''
          }
          ${
            stores.length
              ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:separate;border-spacing:0">
              <tr>
                <td style="padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,#13061f 0%,#d6d70d 70%,#00e7ff 130%);color:#ffffff;font:900 18px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase">Chosen platforms</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
              <tr>
                <td>
                  ${stores
                    .map(store => {
                      const meta = getDspMeta(store);
                      const logo = absoluteUrl(meta?.logo);
                      const label = meta?.name || store;
                      return logo
                        ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" width="42" height="42" style="display:inline-block;width:42px;height:42px;object-fit:contain;margin:8px 12px 8px 0;vertical-align:middle" />`
                        : `<span style="display:inline-block;margin:8px 8px 8px 0;padding:8px 10px;border-radius:999px;background:#fbf7ff;color:#4d4350;font:800 12px Arial,sans-serif">${escapeHtml(label)}</span>`;
                    })
                    .join('')}
                </td>
              </tr>
            </table>
          `
              : ''
          }
          ${
            policyAcceptances
              ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;border:1px solid #eadff0;border-radius:14px">
              <tr>
                <td colspan="2" style="padding:14px 16px;background:#fbf7ff;color:#171018;font:900 15px Arial,sans-serif">Policy acceptance proof</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#6b6070;font:700 12px Arial,sans-serif">YouTube Content ID</td>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#171018;font:700 12px Arial,sans-serif">${policyAcceptances.youtubeContentId.accepted ? 'Accepted' : 'Not required'}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#6b6070;font:700 12px Arial,sans-serif">Facebook Rights Manager</td>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#171018;font:700 12px Arial,sans-serif">${policyAcceptances.facebookRightsManager.accepted ? 'Accepted' : 'Not required'}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#6b6070;font:700 12px Arial,sans-serif">Final declaration</td>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#171018;font:700 12px Arial,sans-serif">Accepted ${escapeHtml(policyAcceptances.acceptedAt ? new Date(policyAcceptances.acceptedAt).toISOString() : '')}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#6b6070;font:700 12px Arial,sans-serif">Accepted by</td>
                <td style="padding:10px 16px;border-top:1px solid #f0e6ee;color:#171018;font:700 12px Arial,sans-serif">${escapeHtml(policyAcceptances.acceptedBy?.email || policyAcceptances.acceptedBy?.name || policyAcceptances.acceptedBy?.userId || '')}</td>
              </tr>
            </table>
          `
              : ''
          }
        </td>
      </tr>
    </table>
  `;
};

const renderHtml = ({ title, intro, details, release, actionLabel, actionUrl }: ActionEmail) => `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#ffffff;color:#171018">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:26px 12px">
        <tr>
          <td align="center">
            <table role="presentation"  cellpadding="0" cellspacing="0" style="width:100%; background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #eadff0;box-shadow:0 18px 45px rgba(28,18,34,.12)">
              <tr>
                <td style="padding:28px 36px;background:linear-gradient(135deg,#13061f 0%,#26123a 54%,#00e7ff 135%);color:#ffffff;border-bottom:4px solid #00e7ff">
                  <img src="${escapeHtml(getLogoUrl())}" alt="Karhari Media Distribution" width="228" draggable="false" style="display:block;max-width:228px;height:auto;margin:0;pointer-events:none;user-select:none" />
                </td>
              </tr>
              <tr>
                <td style="padding:38px 40px 30px">
                  <h1 style="margin:0 0 14px;color:#171018;font:900 30px/1.15 Arial,sans-serif;letter-spacing:-.01em">${escapeHtml(title)}</h1>
                  <p style="margin:0;color:#4d4350;font:500 16px/1.65 Arial,sans-serif">${escapeHtml(intro)}</p>
                  ${renderDetails(details)}
                  ${renderReleaseSummary(release)}
                  ${actionLabel && actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:28px;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#00e7ff,#d6d70d);color:#ffffff;text-decoration:none;font:900 14px Arial,sans-serif;box-shadow:0 14px 26px rgba(0,231,255,.22)">${escapeHtml(actionLabel)}</a>` : ''}
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

const renderText = ({ title, intro, details, actionLabel, actionUrl }: ActionEmail) =>
  [
    title,
    '',
    intro,
    '',
    ...Object.entries(details || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([label, value]) => `${label}: ${value}`),
    actionLabel && actionUrl ? `${actionLabel}: ${actionUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

const sendOne = async (recipient: string, email: ActionEmail) => {
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
  await smtpCommand(socket, `RCPT TO:<${recipient}>`);
  await smtpCommand(socket, 'DATA');

  const message = [
    `From: Karhari Media Distribution <${user}>`,
    `To: ${recipient}`,
    `Subject: ${email.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    renderHtml(email) || renderText(email),
    '.',
  ].join('\r\n');
  socket.write(`${message}\r\n`);
  await readSmtpResponse(socket);
  socket.write('QUIT\r\n');
  socket.end();
};

const uniqueRecipients = (recipients: Recipient[]) =>
  Array.from(
    new Set(recipients.map(recipient => recipient.email?.trim().toLowerCase()).filter(Boolean))
  ) as string[];

const buildNotificationMessage = ({ title, intro }: ActionEmail) => {
  const message = [title, intro]
    .map(value => value.trim())
    .filter(Boolean)
    .join(': ');
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
};

const createEmailNotifications = async (db: Db, recipients: string[], email: ActionEmail) => {
  try {
    if (!recipients.length) return;

    const users = await db
      .collection('users')
      .find({ email: { $in: recipients }, isActive: { $ne: false } }, { projection: { _id: 1 } })
      .toArray();

    if (!users.length) return;

    const now = new Date();
    const message = buildNotificationMessage(email);
    await db.collection('notifications').insertMany(
      users.map(user => ({
        userId: user._id,
        message,
        type: 'email',
        isRead: false,
        createdAt: now,
        updatedAt: now,
      }))
    );
  } catch (error) {
    console.warn('Karhari Media Distribution email notification skipped:', error);
  }
};

export const getAdminRecipients = async (db: Db): Promise<Recipient[]> => {
  const admins = await db
    .collection('users')
    .find({ role: 'admin', isActive: { $ne: false } }, { projection: { name: 1, email: 1 } })
    .toArray();
  return admins.map(admin => ({
    name: String(admin.name || ''),
    email: String(admin.email || ''),
  }));
};

const isNotificationEnabled = async (db: Db | undefined, notificationType?: string): Promise<boolean> => {
  if (!notificationType || !db) return true;
  try {
    const setting = await db.collection('settings').findOne({ key: notificationType });
    return setting ? setting.value === true : true;
  } catch {
    return true;
  }
};

export const sendActionEmail = async (recipients: Recipient[], email: ActionEmail, db?: Db, notificationType?: string) => {
  const to = uniqueRecipients(recipients);
  if (!to.length) return;

  const enabled = await isNotificationEnabled(db, notificationType);
  if (!enabled) {
    console.warn(`Karhari Media Distribution email skipped: notification type "${notificationType}" is disabled`);
    return;
  }

  const results = await Promise.allSettled(to.map(recipient => sendOne(recipient, email)));
  results.forEach(result => {
    if (result.status === 'rejected')
      console.warn('Karhari Media Distribution email skipped:', result.reason);
  });

  if (db) await createEmailNotifications(db, to, email);
};

export const sendUserAndAdminEmail = async (db: Db, user: Recipient, email: ActionEmail, notificationType?: string) => {
  const admins = await getAdminRecipients(db);
  await sendActionEmail([user, ...admins], email, db, notificationType);
};

export const appUrl = (path: string) =>
  `${getFrontendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
