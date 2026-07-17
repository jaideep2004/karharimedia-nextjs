import crypto from 'crypto';
import mongoose, { SortOrder } from 'mongoose';
import {
  AdminPermission,
  NotificationType,
  SupportMessageVisibility,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSource,
  SupportTicketStatus,
  UserRole,
} from '../config/constants';
import SupportMessage, { ISupportAttachment } from '../models/supportMessage.model';
import SupportTicket, { ISupportTicket } from '../models/supportTicket.model';
import UserRepository from '../repositories/user.repository';
import { createNotification } from './notification.service';
import { ApiError } from '../middleware/errorHandler.middleware';
import { getFileUrl } from '../utils/fileUpload';

type Actor = {
  _id: mongoose.Types.ObjectId | string;
  role?: string;
  permissions?: string[];
  supportCategories?: SupportTicketCategory[];
};

type TicketInput = {
  ownerId: mongoose.Types.ObjectId | string;
  subject?: string;
  category: SupportTicketCategory;
  customIssue?: string;
  message: string;
  priority?: SupportTicketPriority;
  source?: SupportTicketSource;
  related?: ISupportTicket['related'];
  idempotencyKey?: string;
  createdBy?: mongoose.Types.ObjectId | string;
  authorRole?: 'user' | 'admin' | 'system';
};

const VALID_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  [SupportTicketStatus.OPEN]: [SupportTicketStatus.IN_REVIEW, SupportTicketStatus.CLOSED],
  [SupportTicketStatus.IN_REVIEW]: [
    SupportTicketStatus.WAITING_FOR_USER,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.WAITING_FOR_USER]: [
    SupportTicketStatus.IN_REVIEW,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.RESOLVED]: [SupportTicketStatus.IN_REVIEW, SupportTicketStatus.CLOSED],
  [SupportTicketStatus.CLOSED]: [SupportTicketStatus.OPEN],
};

const ALL_SUPPORT_CATEGORIES = Object.values(SupportTicketCategory) as SupportTicketCategory[];

const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  [SupportTicketCategory.KYC_VERIFICATION]: 'KYC verification',
  [SupportTicketCategory.RELEASE_REJECTION]: 'Release rejection',
  [SupportTicketCategory.COPYRIGHT_ISSUE]: 'Copyright issue',
  [SupportTicketCategory.DSP_DELIVERY]: 'DSP delivery',
  [SupportTicketCategory.ROYALTIES_PAYMENTS]: 'Royalties / payments',
  [SupportTicketCategory.TECHNICAL_ISSUE]: 'Technical issue',
  [SupportTicketCategory.ACCOUNT_SUPPORT]: 'Account support',
  [SupportTicketCategory.OTHER]: 'Other',
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getSupportCategoryScope(actor: Actor): SupportTicketCategory[] | undefined {
  if (actor.role === UserRole.ADMIN) return undefined;
  if (actor.role !== UserRole.SUBADMIN) return [];

  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (!permissions.includes(AdminPermission.SUPPORT)) return [];

  if (!Array.isArray(actor.supportCategories)) return ALL_SUPPORT_CATEGORIES;

  return actor.supportCategories.filter((category) =>
    ALL_SUPPORT_CATEGORIES.includes(category)
  );
}

function assertCanManageSupportCategory(actor: Actor, ticket: ISupportTicket) {
  const scope = getSupportCategoryScope(actor);
  if (!scope) return;
  if (!scope.includes(ticket.category)) {
    throw new ApiError('Not authorized to manage this support category', 403);
  }
}

function parseDate(value?: string, exclusiveEnd = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (exclusiveEnd && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function getMonthRange(month?: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return {};
  const [year, monthIndex] = month.split('-').map(Number);
  const from = new Date(Date.UTC(year, monthIndex - 1, 1));
  const to = new Date(Date.UTC(year, monthIndex, 1));
  return { from, to };
}

function getAdminTicketSort(sort?: string): Record<string, SortOrder> {
  switch (sort) {
    case 'oldest':
      return { lastMessageAt: 1, createdAt: 1 };
    case 'priority':
      return { priority: -1, lastMessageAt: -1 };
    case 'status':
      return { status: 1, lastMessageAt: -1 };
    case 'latest':
    default:
      return { lastMessageAt: -1, createdAt: -1 };
  }
}

function toObjectId(value: mongoose.Types.ObjectId | string | undefined) {
  if (!value) return undefined;
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function createTicketNumber() {
  return `SA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function deriveTicketSubject(input: TicketInput) {
  const explicitSubject = input.subject?.trim();
  if (explicitSubject) return explicitSubject.slice(0, 180);

  const customIssue = input.customIssue?.trim();
  if (input.category === SupportTicketCategory.OTHER && customIssue) {
    return `Other: ${customIssue}`.slice(0, 180);
  }

  const label = SUPPORT_CATEGORY_LABELS[input.category] || 'Support';
  const messageSummary = input.message.trim().replace(/\s+/g, ' ').slice(0, 72);
  return messageSummary ? `${label}: ${messageSummary}`.slice(0, 180) : `${label} support request`;
}

function ensureTransition(current: SupportTicketStatus, next: SupportTicketStatus) {
  if (current === next) return;
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new ApiError(`Invalid ticket status transition: ${current} to ${next}`, 400);
  }
}

function isAdminActor(actor: Actor) {
  return actor.role === UserRole.ADMIN || actor.role === UserRole.SUBADMIN;
}

async function addUnreadMessageCounts(
  tickets: any[],
  audience: 'admin' | 'user'
) {
  const normalized = tickets.map((ticket) =>
    typeof ticket.toObject === 'function' ? ticket.toObject() : ticket
  );
  const ticketIds = normalized.map((ticket) => ticket._id).filter(Boolean);
  if (ticketIds.length === 0) return normalized;

  const unreadAuthorRole = audience === 'admin' ? 'user' : 'admin';
  const messages = await SupportMessage.find({
    ticketId: { $in: ticketIds },
    visibility: SupportMessageVisibility.PUBLIC,
    authorRole: unreadAuthorRole,
  })
    .select('ticketId createdAt')
    .lean();

  const counts = new Map<string, number>();
  for (const ticket of normalized) {
    const readAt = audience === 'admin' ? ticket.adminReadAt : ticket.userReadAt;
    const ticketId = String(ticket._id);
    const count = messages.filter(
      (message) =>
        String(message.ticketId) === ticketId &&
        (!readAt || new Date(message.createdAt).getTime() > new Date(readAt).getTime())
    ).length;
    counts.set(ticketId, count);
  }

  return normalized.map((ticket) => ({
    ...ticket,
    unreadMessageCount: counts.get(String(ticket._id)) || 0,
  }));
}

async function notifySupportAdmins(message: string, ticketId: mongoose.Types.ObjectId | string) {
  const ticket = await SupportTicket.findById(ticketId).select('category');
  const category = ticket?.category;
  const admins = await UserRepository.find({
    $or: [
      { role: UserRole.ADMIN },
      {
        role: UserRole.SUBADMIN,
        permissions: AdminPermission.SUPPORT,
        ...(category
          ? {
              $or: [
                { supportCategories: { $exists: false } },
                { supportCategories: category },
              ],
            }
          : {}),
      },
    ],
  }).select('_id');

  await Promise.all(
    admins.map((admin: any) =>
      createNotification(
        admin._id,
        message,
        NotificationType.SUPPORT_TICKET_UPDATED,
        ticketId,
        'SupportTicket'
      )
    )
  );
}

async function appendMessage(params: {
  ticket: ISupportTicket;
  authorId?: mongoose.Types.ObjectId | string;
  authorRole: 'user' | 'admin' | 'system';
  body: string;
  visibility: SupportMessageVisibility;
  attachments?: ISupportAttachment[];
}) {
  const message = await SupportMessage.create({
    ticketId: params.ticket._id,
    authorId: toObjectId(params.authorId),
    authorRole: params.authorRole,
    body: params.body,
    visibility: params.visibility,
    attachments: params.attachments || [],
  });

  params.ticket.lastMessageAt = new Date();
  await params.ticket.save();
  return message;
}

async function setTicketStatus(
  ticket: ISupportTicket,
  status: SupportTicketStatus,
  actorId?: mongoose.Types.ObjectId | string,
  reason?: string
) {
  ensureTransition(ticket.status, status);
  if (ticket.status === status) return ticket;

  ticket.status = status;
  if (status === SupportTicketStatus.CLOSED) {
    ticket.closedAt = new Date();
  } else {
    ticket.closedAt = undefined;
  }

  ticket.statusHistory.push({
    status,
    changedBy: toObjectId(actorId),
    reason,
    at: new Date(),
  });

  await ticket.save();
  return ticket;
}

export async function createSupportTicket(input: TicketInput) {
  if (input.idempotencyKey) {
    const existing = await SupportTicket.findOne({ idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
  }

  const ownerId = toObjectId(input.ownerId);
  if (!ownerId) throw new ApiError('Ticket owner is required', 400);
  const subject = deriveTicketSubject(input);

  const ticket = await SupportTicket.create({
    ticketNumber: createTicketNumber(),
    ownerId,
    subject,
    category: input.category,
    priority: input.priority || SupportTicketPriority.NORMAL,
    source: input.source || SupportTicketSource.USER,
    related: input.related,
    idempotencyKey: input.idempotencyKey,
    status: SupportTicketStatus.OPEN,
    statusHistory: [
      {
        status: SupportTicketStatus.OPEN,
        changedBy: toObjectId(input.createdBy),
        reason: 'Ticket created',
        at: new Date(),
      },
    ],
    lastMessageAt: new Date(),
  });

  await appendMessage({
    ticket,
    authorId: input.createdBy,
    authorRole: input.authorRole || 'user',
    body: input.message,
    visibility: SupportMessageVisibility.PUBLIC,
  });

  await notifySupportAdmins(`New support ticket ${ticket.ticketNumber}: ${ticket.subject}`, ticket._id);
  return ticket;
}

export async function listUserTickets(userId: string, params: { status?: string; page?: number; limit?: number }) {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const query: Record<string, unknown> = { ownerId: userId };
  if (params.status) query.status = params.status;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate('assignedTo', 'name email role')
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SupportTicket.countDocuments(query),
  ]);

  return {
    tickets: await addUnreadMessageCounts(tickets, 'user'),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function listAdminTickets(params: {
  status?: string;
  category?: string;
  assignedTo?: string;
  search?: string;
  from?: string;
  to?: string;
  month?: string;
  sort?: string;
  page?: number;
  limit?: number;
}, actor: Actor) {
  const page = params.page || 1;
  const limit = params.limit || 25;
  const query: Record<string, unknown> = {};
  if (params.status) query.status = params.status;
  if (params.assignedTo) query.assignedTo = params.assignedTo;

  const categoryScope = getSupportCategoryScope(actor);
  if (categoryScope && categoryScope.length === 0) {
    return { tickets: [], pagination: { page, limit, total: 0, pages: 0 } };
  }
  if (params.category) {
    if (categoryScope && !categoryScope.includes(params.category as SupportTicketCategory)) {
      return { tickets: [], pagination: { page, limit, total: 0, pages: 0 } };
    }
    query.category = params.category;
  } else if (categoryScope) {
    query.category = { $in: categoryScope };
  }

  const monthRange = getMonthRange(params.month);
  const from = parseDate(params.from) || monthRange.from;
  const to = parseDate(params.to, true) || monthRange.to;
  if (from || to) {
    query.lastMessageAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lt: to } : {}),
    };
  }

  const search = params.search?.trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const users = await UserRepository.find({
      $or: [{ name: regex }, { email: regex }, { artistName: regex }],
    })
      .select('_id')
      .limit(100);
    query.$or = [
      { subject: regex },
      { ticketNumber: regex },
      ...(
        users.length
          ? [{ ownerId: { $in: users.map((user: any) => user._id) } }]
          : []
      ),
    ];
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate('ownerId', 'name email role artistName profilePicture')
      .populate('assignedTo', 'name email role')
      .sort(getAdminTicketSort(params.sort))
      .skip((page - 1) * limit)
      .limit(limit),
    SupportTicket.countDocuments(query),
  ]);

  return {
    tickets: await addUnreadMessageCounts(tickets, 'admin'),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getTicketWithMessages(ticketId: string, actor: Actor) {
  const ticket = await SupportTicket.findById(ticketId)
    .populate('ownerId', 'name email role artistName profilePicture')
    .populate('assignedTo', 'name email role');

  if (!ticket) throw new ApiError('Support ticket not found', 404);

  const ownerId = ((ticket.ownerId as any)?._id || ticket.ownerId).toString();
  if (isAdminActor(actor)) {
    assertCanManageSupportCategory(actor, ticket);
  } else if (ownerId !== String(actor._id)) {
    throw new ApiError('Not authorized to access this support ticket', 403);
  }

  const messageQuery: Record<string, unknown> = { ticketId: ticket._id };
  if (!isAdminActor(actor)) {
    messageQuery.visibility = SupportMessageVisibility.PUBLIC;
  }

  const messages = await SupportMessage.find(messageQuery)
    .populate('authorId', 'name email role artistName')
    .sort({ createdAt: 1 });

  const resolvedMessages = messages.map((msg) => {
    const m = msg.toObject();
    if (m.attachments?.length) {
      m.attachments = m.attachments.map((a: ISupportAttachment) => ({
        ...a,
        url: getFileUrl(a.key || a.url || a.fileName, 'support', a.provider as any),
      }));
    }
    return m;
  });

  return { ticket, messages: resolvedMessages };
}

export async function markTicketRead(ticketId: string, actor: Actor) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError('Support ticket not found', 404);

  const ownerId = ((ticket.ownerId as any)?._id || ticket.ownerId).toString();
  if (isAdminActor(actor)) {
    assertCanManageSupportCategory(actor, ticket);
    ticket.adminReadAt = new Date();
  } else if (ownerId === String(actor._id)) {
    ticket.userReadAt = new Date();
  } else {
    throw new ApiError('Not authorized to access this support ticket', 403);
  }

  await ticket.save();
  return ticket;
}

export async function addTicketMessage(params: {
  ticketId: string;
  actor: Actor;
  body: string;
  visibility?: SupportMessageVisibility;
  attachments?: ISupportAttachment[];
}) {
  const ticket = await SupportTicket.findById(params.ticketId);
  if (!ticket) throw new ApiError('Support ticket not found', 404);

  const admin = isAdminActor(params.actor);
  if (admin) {
    assertCanManageSupportCategory(params.actor, ticket);
  }
  if (!admin && ticket.ownerId.toString() !== String(params.actor._id)) {
    throw new ApiError('Not authorized to reply to this support ticket', 403);
  }

  const visibility = params.visibility || SupportMessageVisibility.PUBLIC;
  if (visibility === SupportMessageVisibility.INTERNAL && !admin) {
    throw new ApiError('Only admins can add internal notes', 403);
  }

  const message = await appendMessage({
    ticket,
    authorId: params.actor._id,
    authorRole: admin ? 'admin' : 'user',
    body: params.body,
    visibility,
    attachments: params.attachments,
  });

  if (visibility === SupportMessageVisibility.PUBLIC && ticket.status !== SupportTicketStatus.CLOSED) {
    if (admin && ticket.status !== SupportTicketStatus.WAITING_FOR_USER) {
      if (ticket.status === SupportTicketStatus.OPEN || ticket.status === SupportTicketStatus.RESOLVED) {
        await setTicketStatus(ticket, SupportTicketStatus.IN_REVIEW, params.actor._id, 'Admin started review');
      }
      await setTicketStatus(ticket, SupportTicketStatus.WAITING_FOR_USER, params.actor._id, 'Admin replied');
    }
    if (!admin && [SupportTicketStatus.WAITING_FOR_USER, SupportTicketStatus.RESOLVED].includes(ticket.status)) {
      await setTicketStatus(ticket, SupportTicketStatus.IN_REVIEW, params.actor._id, 'User replied');
    }
  }

  if (admin && visibility === SupportMessageVisibility.PUBLIC) {
    await createNotification(
      ticket.ownerId,
      `Support replied on ticket ${ticket.ticketNumber}`,
      NotificationType.SUPPORT_TICKET_REPLY,
      ticket._id,
      'SupportTicket'
    );
  } else if (!admin) {
    await notifySupportAdmins(`User replied to support ticket ${ticket.ticketNumber}`, ticket._id);
  }

  return message;
}

export async function assignTicket(ticketId: string, admin: Actor, assigneeId: string) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError('Support ticket not found', 404);
  assertCanManageSupportCategory(admin, ticket);

  const assignee = await UserRepository.findById(assigneeId).select('role permissions supportCategories');
  if (!assignee) throw new ApiError('Support assignee not found', 404);
  assertCanManageSupportCategory(assignee as Actor, ticket);

  ticket.assignedTo = toObjectId(assigneeId);
  await ticket.save();

  if (ticket.status === SupportTicketStatus.OPEN) {
    await setTicketStatus(ticket, SupportTicketStatus.IN_REVIEW, admin._id, 'Ticket assigned');
  }

  await createNotification(
    assigneeId,
    `Support ticket ${ticket.ticketNumber} assigned to you`,
    NotificationType.SUPPORT_TICKET_UPDATED,
    ticket._id,
    'SupportTicket'
  );

  return ticket;
}

export async function updateTicketStatus(ticketId: string, actor: Actor, status: SupportTicketStatus, reason?: string) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError('Support ticket not found', 404);
  assertCanManageSupportCategory(actor, ticket);

  await setTicketStatus(ticket, status, actor._id, reason);

  await createNotification(
    ticket.ownerId,
    `Support ticket ${ticket.ticketNumber} status changed to ${status}`,
    NotificationType.SUPPORT_TICKET_UPDATED,
    ticket._id,
    'SupportTicket'
  );

  return ticket;
}

export async function closeUserTicket(ticketId: string, userId: string) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new ApiError('Support ticket not found', 404);
  if (ticket.ownerId.toString() !== userId) {
    throw new ApiError('Not authorized to close this support ticket', 403);
  }

  return setTicketStatus(ticket, SupportTicketStatus.CLOSED, userId, 'Closed by user');
}

export function hasAcrCloudIssue(scan: {
  aiDetection?: unknown[];
  fingerprintMatches?: unknown[];
}) {
  return Boolean((scan.aiDetection?.length || 0) > 0 || (scan.fingerprintMatches?.length || 0) > 0);
}

export async function createAcrCloudIssueTicket(params: {
  ownerId?: string;
  trackId?: string;
  releaseId?: string;
  fileId: string;
  summary: string;
}) {
  if (!params.ownerId) return null;

  return createSupportTicket({
    ownerId: params.ownerId,
    subject: 'ACRCloud review required',
    category: SupportTicketCategory.COPYRIGHT_ISSUE,
    priority: SupportTicketPriority.HIGH,
    source: SupportTicketSource.ACRCLOUD,
    related: {
      trackId: params.trackId ? toObjectId(params.trackId) : undefined,
      releaseId: params.releaseId ? toObjectId(params.releaseId) : undefined,
      acrCloudFileId: params.fileId,
    },
    idempotencyKey: `acrcloud:${params.fileId}`,
    message: params.summary,
    authorRole: 'system',
  });
}

export async function createKycRejectionTicket(params: {
  userId: string;
  reviewedBy?: string;
  reason: string;
}) {
  return createSupportTicket({
    ownerId: params.userId,
    subject: 'KYC verification needs correction',
    category: SupportTicketCategory.KYC_VERIFICATION,
    priority: SupportTicketPriority.NORMAL,
    source: SupportTicketSource.KYC,
    related: {
      kycUserId: toObjectId(params.userId),
    },
    idempotencyKey: `kyc-rejected:${params.userId}`,
    message: `KYC was rejected. Reason: ${params.reason}`,
    createdBy: params.reviewedBy,
    authorRole: 'system',
  });
}
