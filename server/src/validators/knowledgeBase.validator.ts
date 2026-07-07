import { body, param, query } from 'express-validator';
import { KnowledgeBaseArticleStatus } from '../models/knowledgeBaseArticle.model';

export const kbIdValidator = [
  param('id').isMongoId().withMessage('Invalid knowledge base ID'),
];

export const bulkArticleIdsValidator = [
  body('ids').isArray({ min: 1, max: 100 }).withMessage('Select 1 to 100 articles'),
  body('ids.*').isMongoId().withMessage('Invalid article ID'),
];

export const publicArticleSlugValidator = [
  param('slug').trim().notEmpty().isLength({ max: 200 }).withMessage('Invalid article slug'),
];

export const searchKnowledgeBaseValidator = [
  query('q').trim().notEmpty().isLength({ max: 120 }).withMessage('Search query is required'),
  query('limit').optional().isInt({ min: 1, max: 25 }).withMessage('Limit must be between 1 and 25'),
];

export const listAdminArticlesValidator = [
  query('status').optional().isIn(Object.values(KnowledgeBaseArticleStatus)).withMessage('Invalid article status'),
  query('search').optional().trim().isLength({ max: 120 }).withMessage('Search cannot exceed 120 characters'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

export const categoryValidator = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 120 }),
  body('slug').optional().trim().isLength({ max: 140 }).withMessage('Slug cannot exceed 140 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('iconUrl').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Icon/image URL cannot exceed 1000 characters'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Sort order must be positive'),
];

export const updateCategoryValidator = [
  ...kbIdValidator,
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('slug').optional().trim().isLength({ max: 140 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('iconUrl').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const sectionValidator = [
  body('categoryId').isMongoId().withMessage('Valid category is required'),
  body('name').trim().notEmpty().withMessage('Section name is required').isLength({ max: 120 }),
  body('slug').optional().trim().isLength({ max: 140 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('sortOrder').optional().isInt({ min: 0 }),
];

export const updateSectionValidator = [
  ...kbIdValidator,
  body('categoryId').optional().isMongoId().withMessage('Invalid category ID'),
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('slug').optional().trim().isLength({ max: 140 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

export const articleValidator = [
  body('categoryId').isMongoId().withMessage('Valid category is required'),
  body('sectionId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid section ID'),
  body('title').trim().notEmpty().withMessage('Article title is required').isLength({ max: 180 }),
  body('slug').optional().trim().isLength({ max: 200 }),
  body('excerpt').optional().trim().isLength({ max: 320 }),
  body('status').optional().isIn(Object.values(KnowledgeBaseArticleStatus)).withMessage('Invalid article status'),
  body('content').optional().isObject().withMessage('Content must be a Tiptap JSON object'),
  body('faqBlocks').optional().isArray({ max: 50 }).withMessage('FAQ blocks must be an array'),
  body('videoEmbeds').optional().isArray({ max: 25 }).withMessage('Video embeds must be an array'),
  body('imageRefs').optional().isArray({ max: 50 }).withMessage('Image refs must be an array'),
  body('relatedArticleIds').optional().isArray({ max: 20 }).withMessage('Related articles must be an array'),
  body('relatedArticleIds.*').optional().isMongoId().withMessage('Invalid related article ID'),
];

export const updateArticleValidator = [
  ...kbIdValidator,
  body('categoryId').optional().isMongoId().withMessage('Invalid category ID'),
  body('sectionId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid section ID'),
  body('title').optional().trim().notEmpty().isLength({ max: 180 }),
  body('slug').optional().trim().isLength({ max: 200 }),
  body('excerpt').optional().trim().isLength({ max: 320 }),
  body('status').optional().isIn(Object.values(KnowledgeBaseArticleStatus)).withMessage('Invalid article status'),
  body('content').optional().isObject().withMessage('Content must be a Tiptap JSON object'),
  body('faqBlocks').optional().isArray({ max: 50 }),
  body('videoEmbeds').optional().isArray({ max: 25 }),
  body('imageRefs').optional().isArray({ max: 50 }),
  body('relatedArticleIds').optional().isArray({ max: 20 }),
  body('relatedArticleIds.*').optional().isMongoId().withMessage('Invalid related article ID'),
];
