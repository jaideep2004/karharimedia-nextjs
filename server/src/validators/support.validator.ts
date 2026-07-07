import { body, param, query } from 'express-validator';
import {
  SupportMessageVisibility,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../config/constants';

export const listSupportTicketsValidator = [
  query('status').optional().isIn(Object.values(SupportTicketStatus)).withMessage('Invalid ticket status'),
  query('category').optional().isIn(Object.values(SupportTicketCategory)).withMessage('Invalid ticket category'),
  query('assignedTo').optional().isMongoId().withMessage('Invalid assignee ID'),
  query('search').optional().trim().isLength({ max: 120 }).withMessage('Search cannot exceed 120 characters'),
  query('from').optional().isISO8601().withMessage('Invalid from date'),
  query('to').optional().isISO8601().withMessage('Invalid to date'),
  query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must use YYYY-MM format'),
  query('sort').optional().isIn(['latest', 'oldest', 'priority', 'status']).withMessage('Invalid ticket sort'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

export const ticketIdValidator = [
  param('id').isMongoId().withMessage('Invalid support ticket ID'),
];

export const createSupportTicketValidator = [
  body('subject').optional().trim().isLength({ max: 180 }).withMessage('Subject cannot exceed 180 characters'),
  body('category').isIn(Object.values(SupportTicketCategory)).withMessage('Invalid ticket category'),
  body('customIssue')
    .customSanitizer((value) => (typeof value === 'string' ? value.trim() : ''))
    .custom((value, { req }) => {
      const text = typeof value === 'string' ? value : '';
      if (text.length > 180) throw new Error('Custom issue cannot exceed 180 characters');
      if (req.body.category === SupportTicketCategory.OTHER && !text) {
        throw new Error('Custom issue is required for Other category');
      }
      return true;
    }),
  body('priority').optional().isIn(Object.values(SupportTicketPriority)).withMessage('Invalid ticket priority'),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 5000 }),
  body('related.releaseId').optional().isMongoId().withMessage('Invalid release ID'),
  body('related.trackId').optional().isMongoId().withMessage('Invalid track ID'),
  body('related.knowledgeBaseArticleId').optional().isMongoId().withMessage('Invalid knowledge base article ID'),
];

export const addSupportMessageValidator = [
  ...ticketIdValidator,
  body('body').trim().notEmpty().withMessage('Message body is required').isLength({ max: 5000 }),
  body('visibility')
    .optional()
    .isIn(Object.values(SupportMessageVisibility))
    .withMessage('Invalid message visibility'),
];

export const assignSupportTicketValidator = [
  ...ticketIdValidator,
  body('assigneeId').isMongoId().withMessage('Invalid assignee ID'),
];

export const updateSupportTicketStatusValidator = [
  ...ticketIdValidator,
  body('status').isIn(Object.values(SupportTicketStatus)).withMessage('Invalid ticket status'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters'),
];
