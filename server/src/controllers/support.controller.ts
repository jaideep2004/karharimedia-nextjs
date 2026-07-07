import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { SupportMessageVisibility, SupportTicketSource, SupportTicketStatus } from '../config/constants';
import { errorResponse, successResponse } from '../utils/apiResponse';
import { getFileUrl } from '../utils/fileUpload';
import {
  addTicketMessage,
  assignTicket,
  closeUserTicket,
  createSupportTicket,
  getTicketWithMessages,
  listAdminTickets,
  listUserTickets,
  markTicketRead,
  updateTicketStatus,
} from '../services/support.service';

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getUserSupportTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listUserTickets(String(req.user._id), {
      status: req.query.status as string | undefined,
      page: toPositiveInt(req.query.page, 1),
      limit: toPositiveInt(req.query.limit, 20),
    });
    successResponse(res, result, 'Support tickets retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve support tickets', error);
  }
};

export const getAdminSupportTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listAdminTickets({
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      assignedTo: req.query.assignedTo as string | undefined,
      search: req.query.search as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      month: req.query.month as string | undefined,
      sort: req.query.sort as string | undefined,
      page: toPositiveInt(req.query.page, 1),
      limit: toPositiveInt(req.query.limit, 25),
    }, req.user);
    successResponse(res, result, 'Support ticket queue retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve support ticket queue', error);
  }
};

export const createUserSupportTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const source = req.body.related?.knowledgeBaseArticleId
      ? SupportTicketSource.KNOWLEDGE_BASE
      : SupportTicketSource.USER;

    const ticket = await createSupportTicket({
      ownerId: req.user._id,
      subject: req.body.subject,
      category: req.body.category,
      customIssue: req.body.customIssue,
      priority: req.body.priority,
      message: req.body.message,
      source,
      related: req.body.related,
      createdBy: req.user._id,
      authorRole: 'user',
    });
    successResponse(res, ticket, 'Support ticket created', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create support ticket', error);
  }
};

export const getSupportTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await getTicketWithMessages(req.params.id, req.user);
    successResponse(res, result, 'Support ticket retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve support ticket', error);
  }
};

export const markSupportTicketRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await markTicketRead(req.params.id, req.user);
    successResponse(res, ticket, 'Support ticket marked as read');
  } catch (error) {
    errorResponse(res, 'Failed to mark support ticket as read', error);
  }
};

export const addSupportMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await addTicketMessage({
      ticketId: req.params.id,
      actor: req.user,
      body: req.body.body,
      visibility: req.body.visibility,
    });
    successResponse(res, message, 'Support message added', 201);
  } catch (error) {
    errorResponse(res, 'Failed to add support message', error);
  }
};

export const addInternalNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await addTicketMessage({
      ticketId: req.params.id,
      actor: req.user,
      body: req.body.body,
      visibility: SupportMessageVisibility.INTERNAL,
    });
    successResponse(res, message, 'Internal note added', 201);
  } catch (error) {
    errorResponse(res, 'Failed to add internal note', error);
  }
};

export const uploadSupportAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      errorResponse(res, 'No attachment file provided', undefined, 400);
      return;
    }

    const attachment = {
      fileName: file.originalname,
      key: file.filename,
      url: getFileUrl(file.filename, 'support'),
      provider: 'local',
      contentType: file.mimetype,
      size: file.size,
    };

    const message = await addTicketMessage({
      ticketId: req.params.id,
      actor: req.user,
      body: req.body.body || 'Attachment uploaded',
      visibility: req.body.visibility || SupportMessageVisibility.PUBLIC,
      attachments: [attachment],
    });

    successResponse(res, { attachment, message }, 'Support attachment uploaded', 201);
  } catch (error) {
    errorResponse(res, 'Failed to upload support attachment', error);
  }
};

export const assignSupportTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await assignTicket(req.params.id, req.user, req.body.assigneeId);
    successResponse(res, ticket, 'Support ticket assigned');
  } catch (error) {
    errorResponse(res, 'Failed to assign support ticket', error);
  }
};

export const updateSupportTicketStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await updateTicketStatus(
      req.params.id,
      req.user,
      req.body.status as SupportTicketStatus,
      req.body.reason
    );
    successResponse(res, ticket, 'Support ticket status updated');
  } catch (error) {
    errorResponse(res, 'Failed to update support ticket status', error);
  }
};

export const closeSupportTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await closeUserTicket(req.params.id, String(req.user._id));
    successResponse(res, ticket, 'Support ticket closed');
  } catch (error) {
    errorResponse(res, 'Failed to close support ticket', error);
  }
};
