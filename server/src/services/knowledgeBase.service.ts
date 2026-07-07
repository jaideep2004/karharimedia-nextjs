import mongoose, { SortOrder } from 'mongoose';
import KnowledgeBaseArticle, {
  IKnowledgeBaseArticle,
  KnowledgeBaseArticleStatus,
} from '../models/knowledgeBaseArticle.model';
import KnowledgeBaseArticleRevision from '../models/knowledgeBaseArticleRevision.model';
import KnowledgeBaseCategory from '../models/knowledgeBaseCategory.model';
import KnowledgeBaseSection from '../models/knowledgeBaseSection.model';
import ApiError from '../utils/ApiError';

type Actor = {
  _id?: mongoose.Types.ObjectId | string;
};

type ArticleInput = {
  categoryId: string;
  sectionId?: string;
  title: string;
  slug?: string;
  excerpt?: string;
  status?: KnowledgeBaseArticleStatus;
  content?: Record<string, unknown>;
  faqBlocks?: Array<{ question: string; answer: string }>;
  videoEmbeds?: Array<{ url: string; title?: string }>;
  imageRefs?: Array<{ url: string; alt?: string }>;
  seo?: { title?: string; description?: string; keywords?: string[] };
  relatedArticleIds?: string[];
};

const DEFAULT_CATEGORIES = [
  'Music Distribution',
  'YouTube Network',
  'Music Publishing',
  'Podcast Management',
  'Video Distribution',
];

type CategoryInput = {
  name: string;
  slug?: string;
  description?: string;
  iconUrl?: string;
  sortOrder?: number;
};

type CategoryUpdateInput = Partial<CategoryInput> & {
  isActive?: boolean;
};

const emptyDoc = { type: 'doc', content: [] };

function actorId(actor?: Actor) {
  return actor?._id ? new mongoose.Types.ObjectId(String(actor._id)) : undefined;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function numericDimension(value: unknown, fallback?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 120 || parsed > 1920) return fallback;
  return Math.round(parsed);
}

function normalizeYoutubeEmbedUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    const nocookieHost = 'www.youtube-nocookie.com';

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const embedMatch = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)/);
      if (embedMatch?.[1]) return `https://${nocookieHost}/embed/${embedMatch[1]}`;

      const watchId = url.searchParams.get('v');
      if (watchId) return `https://${nocookieHost}/embed/${watchId}`;

      const shortsMatch = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
      if (shortsMatch?.[1]) return `https://${nocookieHost}/embed/${shortsMatch[1]}`;
    }

    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://${nocookieHost}/embed/${id}`;
    }
  } catch {
    return '';
  }

  return '';
}

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractText).filter(Boolean).join(' ');
}

function markText(text: string, marks: any[] = []) {
  return marks.reduce((current, mark) => {
    if (mark.type === 'bold') return `<strong>${current}</strong>`;
    if (mark.type === 'italic') return `<em>${current}</em>`;
    if (mark.type === 'underline') return `<u>${current}</u>`;
    if (mark.type === 'strike') return `<s>${current}</s>`;
    if (mark.type === 'code') return `<code>${current}</code>`;
    if (mark.type === 'link') {
      const href = escapeHtml(mark.attrs?.href);
      return `<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">${current}</a>`;
    }
    return current;
  }, text);
}

function renderChildren(node: any): string {
  return Array.isArray(node?.content) ? node.content.map(renderNode).join('') : '';
}

function renderNode(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return markText(escapeHtml(node.text), node.marks || []);

  const children = renderChildren(node);
  switch (node.type) {
    case 'paragraph':
      return children ? `<p>${children}</p>` : '';
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4);
      return `<h${level}>${children}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList':
      return `<ol>${children}</ol>`;
    case 'listItem':
      return `<li>${children}</li>`;
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${escapeHtml(extractText(node))}</code></pre>`;
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';
    case 'table':
      return `<table>${children}</table>`;
    case 'tableRow':
      return `<tr>${children}</tr>`;
    case 'tableHeader':
      return `<th>${children}</th>`;
    case 'tableCell':
      return `<td>${children}</td>`;
    case 'image': {
      const src = escapeHtml(node.attrs?.src);
      const alt = escapeHtml(node.attrs?.alt);
      const width = numericDimension(node.attrs?.width);
      const height = numericDimension(node.attrs?.height);
      const dimensions = `${width ? ` width="${width}" style="max-width:100%;width:${width}px;height:auto;"` : ''}${height ? ` height="${height}"` : ''}`;
      return src ? `<figure><img src="${src}" alt="${alt}"${dimensions} /></figure>` : '';
    }
    case 'youtube': {
      const src = escapeHtml(normalizeYoutubeEmbedUrl(node.attrs?.src));
      const width = numericDimension(node.attrs?.width, 720);
      const height = numericDimension(node.attrs?.height, Math.round((width || 720) * 0.5625));
      return src ? `<div class="kb-video" style="max-width:100%;width:${width}px;"><iframe src="${src}" width="${width}" height="${height}" title="Embedded video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : '';
    }
    default:
      return children;
  }
}

function deriveContent(content?: Record<string, unknown>) {
  const doc = content && typeof content === 'object' ? content : emptyDoc;
  return {
    content: doc,
    contentHtml: renderNode(doc),
    contentText: extractText(doc).replace(/\s+/g, ' ').trim(),
  };
}

function normalizeKeywords(keywords?: string[]) {
  return Array.from(new Set((keywords || []).map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 20);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function firstWords(value: string, count: number) {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

function scoreArticleSearch(article: any, query: string, textScore = 0) {
  const normalizedQuery = normalizeSearchText(query);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const firstTwoQueryWords = queryWords.slice(0, 2).join(' ');
  const title = normalizeSearchText(article.title);
  const slug = String(article.slug || '').toLowerCase();
  const excerpt = normalizeSearchText(article.excerpt);
  const contentText = normalizeSearchText(article.contentText);
  const keywords: string[] = Array.isArray(article.seo?.keywords)
    ? article.seo.keywords.map(normalizeSearchText)
    : [];

  let score = textScore * 10;

  if (title === normalizedQuery) score += 1500;
  if (title.startsWith(normalizedQuery)) score += 1200;
  if (firstTwoQueryWords && firstWords(article.title, 2).startsWith(firstTwoQueryWords)) score += 1000;
  if (title.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) score += 850;
  if (slug.startsWith(slugify(query))) score += 700;
  if (keywords.some((keyword) => keyword === normalizedQuery)) score += 650;
  if (keywords.some((keyword) => keyword.startsWith(normalizedQuery))) score += 520;
  if (title.includes(normalizedQuery)) score += 420;
  if (excerpt.includes(normalizedQuery)) score += 180;
  if (contentText.includes(normalizedQuery)) score += 80;

  queryWords.forEach((word) => {
    if (title.split(/\s+/).some((titleWord) => titleWord.startsWith(word))) score += 120;
    if (keywords.some((keyword) => keyword.startsWith(word))) score += 80;
  });

  score -= Math.min(title.length, 120) / 20;
  return score;
}

async function ensureUniqueArticleSlug(baseSlug: string, currentId?: string) {
  const slug = baseSlug || 'article';
  let candidate = slug;
  let suffix = 2;

  while (true) {
    const existing = await KnowledgeBaseArticle.findOne({ slug: candidate }).select('_id');
    if (!existing || String(existing._id) === currentId) return candidate;
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
}

async function ensureDefaultCategories() {
  const count = await KnowledgeBaseCategory.countDocuments();
  if (count > 0) return;

  await KnowledgeBaseCategory.insertMany(
    DEFAULT_CATEGORIES.map((name, index) => ({
      name,
      slug: slugify(name),
      iconUrl: '',
      sortOrder: index + 1,
      isActive: true,
    })),
    { ordered: false }
  );
}

async function assertCategory(categoryId: string) {
  const category = await KnowledgeBaseCategory.findById(categoryId);
  if (!category) throw new ApiError(404, 'Knowledge base category not found');
  return category;
}

async function assertSection(sectionId: string | undefined, categoryId: string) {
  if (!sectionId) return undefined;
  const section = await KnowledgeBaseSection.findById(sectionId);
  if (!section) throw new ApiError(404, 'Knowledge base section not found');
  if (String(section.categoryId) !== categoryId) {
    throw new ApiError(400, 'Section does not belong to selected category');
  }
  return section;
}

async function createRevision(article: IKnowledgeBaseArticle, action: 'created' | 'updated' | 'published' | 'archived', actor?: Actor) {
  await KnowledgeBaseArticleRevision.create({
    articleId: article._id,
    action,
    snapshot: article.toObject(),
    createdBy: actorId(actor),
  });
}

export async function listKnowledgeBaseTree({ includeDrafts = false } = {}) {
  await ensureDefaultCategories();

  const articleQuery: Record<string, unknown> = includeDrafts
    ? {}
    : { status: KnowledgeBaseArticleStatus.PUBLISHED };

  const [categories, sections, articles] = await Promise.all([
    KnowledgeBaseCategory.find(includeDrafts ? {} : { isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    KnowledgeBaseSection.find(includeDrafts ? {} : { isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    KnowledgeBaseArticle.find(articleQuery)
      .select('categoryId sectionId title slug excerpt status imageRefs publishedAt updatedAt')
      .sort({ publishedAt: -1, updatedAt: -1 })
      .lean(),
  ]);

  return { categories, sections, articles };
}

export async function searchPublishedArticles(search: string, limit = 10) {
  const query = search.trim();
  if (!query) return { articles: [] };
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { articles: [] };

  const escapedQuery = escapeRegex(normalizedQuery);
  const wordPrefixRegex = new RegExp(`(^|[\\s-])${escapedQuery}`, 'i');
  const containsRegex = new RegExp(escapedQuery, 'i');
  const slugPrefix = slugify(query);

  const baseFields = 'categoryId sectionId title slug excerpt contentText seo.keywords publishedAt updatedAt';
  const textProjection = {
    categoryId: 1,
    sectionId: 1,
    title: 1,
    slug: 1,
    excerpt: 1,
    contentText: 1,
    seo: 1,
    publishedAt: 1,
    updatedAt: 1,
    score: { $meta: 'textScore' },
  };

  const [prefixArticles, textArticles] = await Promise.all([
    KnowledgeBaseArticle.find({
      status: KnowledgeBaseArticleStatus.PUBLISHED,
      $or: [
        { title: wordPrefixRegex },
        { slug: new RegExp(`^${escapeRegex(slugPrefix)}`, 'i') },
        { excerpt: containsRegex },
        { 'seo.keywords': wordPrefixRegex },
      ],
    })
      .select(baseFields)
      .limit(Math.max(safeLimit * 4, 20))
      .lean(),
    KnowledgeBaseArticle.find(
      {
        status: KnowledgeBaseArticleStatus.PUBLISHED,
        $text: { $search: query },
      },
      textProjection
    )
      .sort({ score: { $meta: 'textScore' } as unknown as SortOrder })
      .limit(Math.max(safeLimit * 4, 20))
      .lean(),
  ]);

  const textScores = new Map<string, number>();
  textArticles.forEach((article: any) => {
    textScores.set(String(article._id), Number(article.score || 0));
  });

  const merged = new Map<string, any>();
  [...prefixArticles, ...textArticles].forEach((article: any) => {
    merged.set(String(article._id), article);
  });

  const articles = Array.from(merged.values())
    .map((article: any) => ({
      ...article,
      searchRank: scoreArticleSearch(article, query, textScores.get(String(article._id)) || 0),
    }))
    .filter((article) => article.searchRank > 0)
    .sort((left, right) => {
      if (right.searchRank !== left.searchRank) return right.searchRank - left.searchRank;
      return new Date(right.publishedAt || right.updatedAt || 0).getTime() - new Date(left.publishedAt || left.updatedAt || 0).getTime();
    })
    .slice(0, safeLimit)
    .map(({ searchRank: _searchRank, score: _score, contentText: _contentText, seo: _seo, ...article }) => article);

  return { articles };
}

export async function getPublishedArticleBySlug(slug: string) {
  const article = await KnowledgeBaseArticle.findOne({
    slug,
    status: KnowledgeBaseArticleStatus.PUBLISHED,
  })
    .populate('categoryId', 'name slug')
    .populate('sectionId', 'name slug')
    .populate('relatedArticleIds', 'title slug excerpt')
    .lean();

  if (!article) throw new ApiError(404, 'Knowledge base article not found');
  return article;
}

export async function createCategory(input: CategoryInput, actor?: Actor) {
  const category = await KnowledgeBaseCategory.create({
    name: input.name,
    slug: slugify(input.slug || input.name),
    description: input.description,
    iconUrl: input.iconUrl,
    sortOrder: input.sortOrder || 0,
    createdBy: actorId(actor),
    updatedBy: actorId(actor),
  });
  return category;
}

export async function updateCategory(id: string, input: CategoryUpdateInput, actor?: Actor) {
  const category = await KnowledgeBaseCategory.findById(id);
  if (!category) throw new ApiError(404, 'Knowledge base category not found');

  if (input.name !== undefined) category.name = input.name;
  if (input.slug !== undefined) category.slug = slugify(input.slug);
  if (input.description !== undefined) category.description = input.description;
  if (input.iconUrl !== undefined) category.iconUrl = input.iconUrl;
  if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) category.isActive = input.isActive;
  category.updatedBy = actorId(actor);
  await category.save();
  return category;
}

export async function createSection(input: { categoryId: string; name: string; slug?: string; description?: string; sortOrder?: number }, actor?: Actor) {
  await assertCategory(input.categoryId);
  const section = await KnowledgeBaseSection.create({
    categoryId: input.categoryId,
    name: input.name,
    slug: slugify(input.slug || input.name),
    description: input.description,
    sortOrder: input.sortOrder || 0,
    createdBy: actorId(actor),
    updatedBy: actorId(actor),
  });
  return section;
}

export async function updateSection(id: string, input: { categoryId?: string; name?: string; slug?: string; description?: string; sortOrder?: number; isActive?: boolean }, actor?: Actor) {
  const section = await KnowledgeBaseSection.findById(id);
  if (!section) throw new ApiError(404, 'Knowledge base section not found');

  if (input.categoryId !== undefined) {
    await assertCategory(input.categoryId);
    section.categoryId = new mongoose.Types.ObjectId(input.categoryId);
  }
  if (input.name !== undefined) section.name = input.name;
  if (input.slug !== undefined) section.slug = slugify(input.slug);
  if (input.description !== undefined) section.description = input.description;
  if (input.sortOrder !== undefined) section.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) section.isActive = input.isActive;
  section.updatedBy = actorId(actor);
  await section.save();
  return section;
}

export async function listAdminArticles(params: { status?: string; search?: string; page?: number; limit?: number }) {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
  const query: Record<string, unknown> = {};

  if (params.status && Object.values(KnowledgeBaseArticleStatus).includes(params.status as KnowledgeBaseArticleStatus)) {
    query.status = params.status;
  }

  if (params.search?.trim()) {
    const regex = new RegExp(params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ title: regex }, { slug: regex }, { excerpt: regex }];
  }

  const [articles, total] = await Promise.all([
    KnowledgeBaseArticle.find(query)
      .populate('categoryId', 'name slug')
      .populate('sectionId', 'name slug')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    KnowledgeBaseArticle.countDocuments(query),
  ]);

  return { articles, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getAdminArticle(id: string) {
  const article = await KnowledgeBaseArticle.findById(id)
    .populate('categoryId', 'name slug')
    .populate('sectionId', 'name slug')
    .lean();
  if (!article) throw new ApiError(404, 'Knowledge base article not found');
  return article;
}

export async function createArticle(input: ArticleInput, actor?: Actor) {
  await assertCategory(input.categoryId);
  await assertSection(input.sectionId, input.categoryId);
  const derived = deriveContent(input.content);
  const status = input.status || KnowledgeBaseArticleStatus.DRAFT;

  const article = await KnowledgeBaseArticle.create({
    ...derived,
    categoryId: input.categoryId,
    sectionId: input.sectionId,
    title: input.title,
    slug: await ensureUniqueArticleSlug(slugify(input.slug || input.title)),
    excerpt: input.excerpt,
    status,
    faqBlocks: input.faqBlocks || [],
    videoEmbeds: input.videoEmbeds || [],
    imageRefs: input.imageRefs || [],
    seo: {
      ...input.seo,
      keywords: normalizeKeywords(input.seo?.keywords),
    },
    relatedArticleIds: (input.relatedArticleIds || []).map((id) => new mongoose.Types.ObjectId(id)),
    publishedAt: status === KnowledgeBaseArticleStatus.PUBLISHED ? new Date() : undefined,
    createdBy: actorId(actor),
    updatedBy: actorId(actor),
  });

  await createRevision(article, status === KnowledgeBaseArticleStatus.PUBLISHED ? 'published' : 'created', actor);
  return article;
}

export async function updateArticle(id: string, input: Partial<ArticleInput>, actor?: Actor) {
  const article = await KnowledgeBaseArticle.findById(id);
  if (!article) throw new ApiError(404, 'Knowledge base article not found');

  const nextCategoryId = input.categoryId || String(article.categoryId);
  if (input.categoryId !== undefined) await assertCategory(input.categoryId);
  if (input.sectionId !== undefined) await assertSection(input.sectionId, nextCategoryId);

  if (input.categoryId !== undefined) article.categoryId = new mongoose.Types.ObjectId(input.categoryId);
  if (input.sectionId !== undefined) {
    article.sectionId = input.sectionId ? new mongoose.Types.ObjectId(input.sectionId) : undefined;
  }
  if (input.title !== undefined) article.title = input.title;
  if (input.slug !== undefined) article.slug = await ensureUniqueArticleSlug(slugify(input.slug), id);
  if (input.excerpt !== undefined) article.excerpt = input.excerpt;
  if (input.content !== undefined) {
    const derived = deriveContent(input.content);
    article.content = derived.content;
    article.contentHtml = derived.contentHtml;
    article.contentText = derived.contentText;
  }
  if (input.faqBlocks !== undefined) article.faqBlocks = input.faqBlocks as any;
  if (input.videoEmbeds !== undefined) article.videoEmbeds = input.videoEmbeds as any;
  if (input.imageRefs !== undefined) article.imageRefs = input.imageRefs as any;
  if (input.seo !== undefined) {
    article.seo = {
      title: input.seo.title,
      description: input.seo.description,
      keywords: normalizeKeywords(input.seo.keywords),
    };
  }
  if (input.relatedArticleIds !== undefined) {
    article.relatedArticleIds = input.relatedArticleIds.map((relatedId) => new mongoose.Types.ObjectId(relatedId));
  }
  if (input.status !== undefined) {
    article.status = input.status;
    if (input.status === KnowledgeBaseArticleStatus.PUBLISHED && !article.publishedAt) {
      article.publishedAt = new Date();
    }
    if (input.status !== KnowledgeBaseArticleStatus.PUBLISHED) {
      article.publishedAt = undefined;
    }
  }

  article.updatedBy = actorId(actor);
  await article.save();

  const action =
    article.status === KnowledgeBaseArticleStatus.PUBLISHED
      ? 'published'
      : article.status === KnowledgeBaseArticleStatus.ARCHIVED
        ? 'archived'
        : 'updated';
  await createRevision(article, action, actor);
  return article;
}

export async function deleteArticle(id: string, actor?: Actor) {
  const article = await KnowledgeBaseArticle.findById(id);
  if (!article) throw new ApiError(404, 'Knowledge base article not found');
  article.status = KnowledgeBaseArticleStatus.ARCHIVED;
  article.publishedAt = undefined;
  article.updatedBy = actorId(actor);
  await article.save();
  await createRevision(article, 'archived', actor);
  return article;
}

export async function bulkDeleteArticles(ids: string[], actor?: Actor) {
  const uniqueIds = Array.from(new Set(ids.map(String))).filter(Boolean);
  const archivedIds: string[] = [];

  for (const id of uniqueIds) {
    const article = await deleteArticle(id, actor);
    archivedIds.push(String(article._id));
  }

  return { archivedIds, count: archivedIds.length };
}

export async function listArticleRevisions(articleId: string) {
  const revisions = await KnowledgeBaseArticleRevision.find({ articleId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return { revisions };
}
