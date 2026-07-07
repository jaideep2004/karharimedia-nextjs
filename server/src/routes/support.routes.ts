import { Router } from 'express';
import {
  addInternalNote,
  addSupportMessage,
  assignSupportTicket,
  closeSupportTicket,
  createUserSupportTicket,
  getAdminSupportTickets,
  getSupportTicket,
  getUserSupportTickets,
  markSupportTicketRead,
  updateSupportTicketStatus,
  uploadSupportAttachment,
} from '../controllers/support.controller';
import { AdminPermission, UserRole } from '../config/constants';
import { authorize, authorizeAdminPermission, protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validator.middleware';
import { uploadSupportAttachment as uploadSupportAttachmentMiddleware } from '../utils/fileUpload';
import {
  addSupportMessageValidator,
  assignSupportTicketValidator,
  createSupportTicketValidator,
  listSupportTicketsValidator,
  ticketIdValidator,
  updateSupportTicketStatusValidator,
} from '../validators/support.validator';

const router = Router();

router.use(protect);

router.get(
  '/tickets/admin',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(listSupportTicketsValidator),
  getAdminSupportTickets
);

router.patch(
  '/tickets/admin/:id/assign',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(assignSupportTicketValidator),
  assignSupportTicket
);

router.patch(
  '/tickets/admin/:id/status',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(updateSupportTicketStatusValidator),
  updateSupportTicketStatus
);

router.post(
  '/tickets/admin/:id/messages',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(addSupportMessageValidator),
  addSupportMessage
);

router.patch(
  '/tickets/admin/:id/read',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(ticketIdValidator),
  markSupportTicketRead
);

router.post(
  '/tickets/admin/:id/attachments',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(ticketIdValidator),
  uploadSupportAttachmentMiddleware.single('attachment'),
  uploadSupportAttachment
);

router.post(
  '/tickets/admin/:id/internal-notes',
  authorizeAdminPermission(AdminPermission.SUPPORT),
  validate(addSupportMessageValidator),
  addInternalNote
);

router.get(
  '/tickets',
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN, UserRole.SUBADMIN]),
  validate(listSupportTicketsValidator),
  getUserSupportTickets
);

router.post(
  '/tickets',
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN, UserRole.SUBADMIN]),
  validate(createSupportTicketValidator),
  createUserSupportTicket
);

router.get(
  '/tickets/:id',
  validate(ticketIdValidator),
  getSupportTicket
);

router.patch(
  '/tickets/:id/read',
  validate(ticketIdValidator),
  markSupportTicketRead
);

router.post(
  '/tickets/:id/messages',
  validate(addSupportMessageValidator),
  addSupportMessage
);

router.post(
  '/tickets/:id/attachments',
  validate(ticketIdValidator),
  uploadSupportAttachmentMiddleware.single('attachment'),
  uploadSupportAttachment
);

router.patch(
  '/tickets/:id/close',
  validate(ticketIdValidator),
  closeSupportTicket
);

export default router;
