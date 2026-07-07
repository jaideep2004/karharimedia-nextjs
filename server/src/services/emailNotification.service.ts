import User from '../repositories/user.repository';
import { NotificationType, UserRole } from '../config/constants';
import { sendEmailMessage } from './otp.service';
import { createNotification } from './notification.service';
import { getFrontendUrl } from '../utils/frontendUrl';

type MailRecipient = {
  email?: string;
  name?: string;
};

type ActionEmail = {
  subject: string;
  title: string;
  intro: string;
  details?: Record<string, string | number | undefined | null>;
  actionLabel?: string;
  actionUrl?: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getLogoUrl = () => `${getFrontendUrl()}/images/karhari-media-b1.png`;
const getHelpCenterUrl = () => `${getFrontendUrl()}/help`;

const renderDetails = (details?: ActionEmail['details']) => {
  const rows = Object.entries(details || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!rows.length) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:separate;border-spacing:0;border:1px solid #e7ddea;border-radius:18px;overflow:hidden;background:#ffffff">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:14px 16px;background:#fbf7ff;color:#6b6070;font:700 12px Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;width:38%;border-bottom:1px solid #f1e9f3">${escapeHtml(label)}</td>
          <td style="padding:14px 16px;color:#171018;font:700 14px Arial,sans-serif;border-bottom:1px solid #f1e9f3">${escapeHtml(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;
};

const renderEmail = ({ title, intro, details, actionLabel, actionUrl }: ActionEmail) => `
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
                  <h1 style="margin:0 0 14px;color:#171018;font:900 30px/1.15 Arial,sans-serif;letter-spacing:-.01em">${escapeHtml(title)}</h1>
                  <p style="margin:0;color:#4d4350;font:500 16px/1.65 Arial,sans-serif">${escapeHtml(intro)}</p>
                  ${renderDetails(details)}
                  ${actionLabel && actionUrl ? `
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:28px;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#00e7ff,#d6d70d);color:#ffffff;text-decoration:none;font:900 14px Arial,sans-serif;box-shadow:0 14px 26px rgba(0,231,255,.22)">${escapeHtml(actionLabel)}</a>
                  ` : ''}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:34px;padding-top:18px;border-top:1px solid #f0e6ee">
                    <tr>
                      <td style="color:#8d808c;font:500 12px/1.6 Arial,sans-serif">
                        Need help? Visit <a href="${escapeHtml(getHelpCenterUrl())}" style="color:#d6d70d;text-decoration:none;font-weight:800">Karhari Media Distribution Help Center</a>.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:6px;color:#aaa0aa;font:400 11px/1.5 Arial,sans-serif">
                        Copyright ${new Date().getFullYear()} Karhari Media Distribution. All rights reserved.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

const textFromEmail = ({ title, intro, details, actionLabel, actionUrl }: ActionEmail) => [
  title,
  '',
  intro,
  '',
  ...Object.entries(details || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label}: ${value}`),
  actionLabel && actionUrl ? `${actionLabel}: ${actionUrl}` : '',
].filter(Boolean).join('\n');

const uniqueRecipients = (recipients: MailRecipient[]) =>
  Array.from(
    new Map(
      recipients
        .map((recipient) => ({ ...recipient, email: recipient.email?.trim().toLowerCase() }))
        .filter((recipient): recipient is Required<MailRecipient> => Boolean(recipient.email))
        .map((recipient) => [recipient.email, recipient])
    ).values()
  );

const buildNotificationMessage = ({ title, intro }: ActionEmail) => {
  const message = [title, intro].map((value) => value.trim()).filter(Boolean).join(': ');
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
};

const createEmailNotifications = async (recipients: MailRecipient[], email: ActionEmail) => {
  try {
    const emails = recipients.map((recipient) => recipient.email).filter(Boolean);
    if (!emails.length) return;

    const users = await User.find({ email: { $in: emails }, isActive: { $ne: false } }).select('_id').lean();
    const message = buildNotificationMessage(email);

    await Promise.all(
      users.map((user) => createNotification(user._id, message, NotificationType.EMAIL))
    );
  } catch (error) {
    console.warn('Karhari Media Distribution email notification skipped:', error);
  }
};

export const getAdminEmailRecipients = async (): Promise<MailRecipient[]> => {
  const admins = await User.find({ role: UserRole.ADMIN, isActive: { $ne: false } }).select('name email').lean();
  return admins.map((admin) => ({ name: admin.name, email: admin.email }));
};

export const sendActionEmail = async (recipients: MailRecipient[], email: ActionEmail): Promise<void> => {
  const to = uniqueRecipients(recipients);
  if (!to.length) return;

  const html = renderEmail(email);
  const text = textFromEmail(email);
  const results = await Promise.allSettled(
    to.map((recipient) => sendEmailMessage(recipient.email, email.subject, text, html))
  );

  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('Karhari Media Distribution email skipped:', result.reason);
    }
  });

  await createEmailNotifications(to, email);
};

export const sendUserAndAdminEmail = async (user: MailRecipient, email: ActionEmail): Promise<void> => {
  const admins = await getAdminEmailRecipients();
  await sendActionEmail([user, ...admins], email);
};

export const buildDashboardUrl = (path: string) => `${getFrontendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
