import { Router } from 'express';
import {
  getKnowledgeBaseTree,
  getPublishedKnowledgeBaseArticle,
  searchKnowledgeBase,
} from '../controllers/knowledgeBase.controller';
import { validate } from '../middleware/validator.middleware';
import {
  publicArticleSlugValidator,
  searchKnowledgeBaseValidator,
} from '../validators/knowledgeBase.validator';

const router = Router();

router.get('/categories', getKnowledgeBaseTree);
router.get('/search', validate(searchKnowledgeBaseValidator), searchKnowledgeBase);
router.get('/articles/:slug', validate(publicArticleSlugValidator), getPublishedKnowledgeBaseArticle);

export default router;
