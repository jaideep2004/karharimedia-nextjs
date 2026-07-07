import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../utils/apiResponse';
import {
  createArticle,
  createCategory,
  createSection,
  bulkDeleteArticles,
  deleteArticle,
  getAdminArticle,
  getPublishedArticleBySlug,
  listAdminArticles,
  listArticleRevisions,
  listKnowledgeBaseTree,
  searchPublishedArticles,
  updateArticle,
  updateCategory,
  updateSection,
} from '../services/knowledgeBase.service';
import { KnowledgeBaseArticleStatus } from '../models/knowledgeBaseArticle.model';
import { getFileUrl } from '../utils/fileUpload';

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getKnowledgeBaseTree = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listKnowledgeBaseTree();
    successResponse(res, result, 'Knowledge base retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base', error);
  }
};

export const searchKnowledgeBase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await searchPublishedArticles(String(req.query.q || ''), toPositiveInt(req.query.limit, 10));
    successResponse(res, result, 'Knowledge base search completed');
  } catch (error) {
    errorResponse(res, 'Failed to search knowledge base', error);
  }
};

export const getPublishedKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await getPublishedArticleBySlug(req.params.slug);
    successResponse(res, article, 'Knowledge base article retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base article', error);
  }
};

export const getAdminKnowledgeBaseTree = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listKnowledgeBaseTree({ includeDrafts: true });
    successResponse(res, result, 'Knowledge base CMS tree retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base CMS tree', error);
  }
};

export const createAdminKnowledgeBaseCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const category = await createCategory(req.body, req.user);
    successResponse(res, category, 'Knowledge base category created', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create knowledge base category', error);
  }
};

export const updateAdminKnowledgeBaseCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const category = await updateCategory(req.params.id, req.body, req.user);
    successResponse(res, category, 'Knowledge base category updated');
  } catch (error) {
    errorResponse(res, 'Failed to update knowledge base category', error);
  }
};

export const createAdminKnowledgeBaseSection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const section = await createSection(req.body, req.user);
    successResponse(res, section, 'Knowledge base section created', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create knowledge base section', error);
  }
};

export const updateAdminKnowledgeBaseSection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const section = await updateSection(req.params.id, req.body, req.user);
    successResponse(res, section, 'Knowledge base section updated');
  } catch (error) {
    errorResponse(res, 'Failed to update knowledge base section', error);
  }
};

export const getAdminKnowledgeBaseArticles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listAdminArticles({
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: toPositiveInt(req.query.page, 1),
      limit: toPositiveInt(req.query.limit, 25),
    });
    successResponse(res, result, 'Knowledge base articles retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base articles', error);
  }
};

export const createAdminKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await createArticle(req.body, req.user);
    successResponse(res, article, 'Knowledge base article created', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create knowledge base article', error);
  }
};

export const getAdminKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await getAdminArticle(req.params.id);
    successResponse(res, article, 'Knowledge base article retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base article', error);
  }
};

export const updateAdminKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await updateArticle(req.params.id, req.body, req.user);
    successResponse(res, article, 'Knowledge base article updated');
  } catch (error) {
    errorResponse(res, 'Failed to update knowledge base article', error);
  }
};

export const publishAdminKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await updateArticle(req.params.id, { status: KnowledgeBaseArticleStatus.PUBLISHED }, req.user);
    successResponse(res, article, 'Knowledge base article published');
  } catch (error) {
    errorResponse(res, 'Failed to publish knowledge base article', error);
  }
};

export const archiveAdminKnowledgeBaseArticle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const article = await deleteArticle(req.params.id, req.user);
    successResponse(res, article, 'Knowledge base article archived');
  } catch (error) {
    errorResponse(res, 'Failed to archive knowledge base article', error);
  }
};

export const bulkArchiveAdminKnowledgeBaseArticles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await bulkDeleteArticles(req.body.ids || [], req.user);
    successResponse(res, result, 'Knowledge base articles archived');
  } catch (error) {
    errorResponse(res, 'Failed to archive knowledge base articles', error);
  }
};

export const getAdminKnowledgeBaseArticleRevisions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await listArticleRevisions(req.params.id);
    successResponse(res, result, 'Knowledge base article revisions retrieved');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve knowledge base article revisions', error);
  }
};

export const uploadAdminKnowledgeBaseMedia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      errorResponse(res, 'No media file provided', undefined, 400);
      return;
    }

    successResponse(res, {
      fileName: file.originalname,
      key: file.filename,
      url: getFileUrl(file.filename, 'knowledge-base'),
      contentType: file.mimetype,
      mediaType: file.mimetype.startsWith('video/') ? 'video' : 'image',
      size: file.size,
    }, 'Knowledge base media uploaded', 201);
  } catch (error) {
    errorResponse(res, 'Failed to upload knowledge base media', error);
  }
};
