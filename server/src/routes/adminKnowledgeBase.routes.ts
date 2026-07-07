import { Router } from 'express';
import {
  archiveAdminKnowledgeBaseArticle,
  bulkArchiveAdminKnowledgeBaseArticles,
  createAdminKnowledgeBaseArticle,
  createAdminKnowledgeBaseCategory,
  createAdminKnowledgeBaseSection,
  getAdminKnowledgeBaseArticle,
  getAdminKnowledgeBaseArticleRevisions,
  getAdminKnowledgeBaseArticles,
  getAdminKnowledgeBaseTree,
  publishAdminKnowledgeBaseArticle,
  updateAdminKnowledgeBaseArticle,
  updateAdminKnowledgeBaseCategory,
  updateAdminKnowledgeBaseSection,
  uploadAdminKnowledgeBaseMedia,
} from '../controllers/knowledgeBase.controller';
import { AdminPermission } from '../config/constants';
import { authorizeAdminPermission, protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validator.middleware';
import {
  articleValidator,
  bulkArticleIdsValidator,
  categoryValidator,
  kbIdValidator,
  listAdminArticlesValidator,
  sectionValidator,
  updateArticleValidator,
  updateCategoryValidator,
  updateSectionValidator,
} from '../validators/knowledgeBase.validator';
import { uploadKnowledgeBaseMedia } from '../utils/fileUpload';

const router = Router();

router.use(protect);
router.use(authorizeAdminPermission(AdminPermission.SUPPORT));

router.get('/tree', getAdminKnowledgeBaseTree);
router.post('/media', uploadKnowledgeBaseMedia.single('media'), uploadAdminKnowledgeBaseMedia);
router.post('/categories', validate(categoryValidator), createAdminKnowledgeBaseCategory);
router.patch('/categories/:id', validate(updateCategoryValidator), updateAdminKnowledgeBaseCategory);
router.post('/sections', validate(sectionValidator), createAdminKnowledgeBaseSection);
router.patch('/sections/:id', validate(updateSectionValidator), updateAdminKnowledgeBaseSection);
router.get('/articles', validate(listAdminArticlesValidator), getAdminKnowledgeBaseArticles);
router.post('/articles', validate(articleValidator), createAdminKnowledgeBaseArticle);
router.post('/articles/bulk-archive', validate(bulkArticleIdsValidator), bulkArchiveAdminKnowledgeBaseArticles);
router.get('/articles/:id', validate(kbIdValidator), getAdminKnowledgeBaseArticle);
router.patch('/articles/:id', validate(updateArticleValidator), updateAdminKnowledgeBaseArticle);
router.delete('/articles/:id', validate(kbIdValidator), archiveAdminKnowledgeBaseArticle);
router.post('/articles/:id/publish', validate(kbIdValidator), publishAdminKnowledgeBaseArticle);
router.get('/articles/:id/revisions', validate(kbIdValidator), getAdminKnowledgeBaseArticleRevisions);

export default router;
