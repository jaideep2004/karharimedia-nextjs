'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Add,
  Archive,
  Article,
  Delete,
  HelpOutline,
  Image as ImageIcon,
  Movie,
  Publish,
  Save,
  Search,
  ViewModule,
} from '@mui/icons-material';
import {
  adminKnowledgeBaseAPI,
  type KnowledgeBaseArticle,
  type KnowledgeBaseArticleStatus,
  type KnowledgeBaseCategory,
  type KnowledgeBaseSection,
} from '@/services/api';
import { groupKnowledgeBase } from '@/components/knowledge-base/kbUtils';
import RouteTabs from '@/components/navigation/RouteTabs';

const TiptapEditor = dynamic(() => import('@/components/knowledge-base/TiptapEditor'), {
  ssr: false,
});

const emptyDoc = { type: 'doc', content: [] };

type ArticleForm = {
  _id?: string;
  categoryId: string;
  sectionId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: KnowledgeBaseArticleStatus;
  content: Record<string, unknown>;
  faqBlocks: Array<{ question: string; answer: string }>;
  videoEmbeds: Array<{ url: string; title?: string }>;
  imageRefs: Array<{ url: string; alt?: string }>;
  seo: { title: string; description: string; keywords: string[] };
  relatedArticleIds: string[];
};

const createBlankArticle = (categoryId = '', sectionId = ''): ArticleForm => ({
  categoryId,
  sectionId,
  title: '',
  slug: '',
  excerpt: '',
  status: 'draft',
  content: emptyDoc,
  faqBlocks: [],
  videoEmbeds: [],
  imageRefs: [],
  seo: { title: '', description: '', keywords: [] },
  relatedArticleIds: [],
});

const idOf = (value: unknown) => (typeof value === 'string' ? value : (value as any)?._id || '');
const slugifyArticleTitle = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatDate = (value?: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
};

export default function AdminKnowledgeBasePage() {
  const theme = useTheme();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<KnowledgeBaseCategory[]>([]);
  const [sections, setSections] = useState<KnowledgeBaseSection[]>([]);
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [form, setForm] = useState<ArticleForm>(createBlankArticle());
  const [categoryDraft, setCategoryDraft] = useState({ name: '', description: '', iconUrl: '' });
  const [sectionDraft, setSectionDraft] = useState({ categoryId: '', name: '', description: '' });
  const [search, setSearch] = useState('');
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [detailSection, setDetailSection] = useState<'seo' | 'faqs' | 'media'>('seo');
  const [articleListOpen, setArticleListOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeCategories = useMemo(() => categories.filter(category => category.isActive !== false), [categories]);
  const archivedCategories = useMemo(() => categories.filter(category => category.isActive === false), [categories]);
  const activeCategoryIds = useMemo(() => new Set(activeCategories.map(category => category._id)), [activeCategories]);
  const activeSections = useMemo(
    () => sections.filter(section => section.isActive !== false && activeCategoryIds.has(String(section.categoryId))),
    [activeCategoryIds, sections]
  );
  const visibleArticles = useMemo(() => articles.filter(article => article.status !== 'archived'), [articles]);
  const archivedArticles = useMemo(() => articles.filter(article => article.status === 'archived'), [articles]);
  const grouped = useMemo(
    () => groupKnowledgeBase(activeCategories, activeSections, visibleArticles),
    [activeCategories, activeSections, visibleArticles]
  );
  const availableSections = useMemo(
    () => activeSections.filter(section => String(section.categoryId) === form.categoryId),
    [activeSections, form.categoryId]
  );
  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return visibleArticles;
    return visibleArticles.filter(article =>
      `${article.title} ${article.slug} ${article.excerpt || ''}`.toLowerCase().includes(query)
    );
  }, [search, visibleArticles]);
  const filteredArchivedArticles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return archivedArticles;
    return archivedArticles.filter(article =>
      `${article.title} ${article.slug} ${article.excerpt || ''}`.toLowerCase().includes(query)
    );
  }, [archivedArticles, search]);
  const viewParam = searchParams.get('view');
  const kbView: 'articles' | 'categories' | 'new' =
    viewParam === 'categories' || viewParam === 'structure'
      ? 'categories'
      : viewParam === 'new'
        ? 'new'
        : viewParam === 'articles'
          ? 'articles'
          : 'categories';
  const showEditor = kbView === 'new' || (kbView === 'articles' && Boolean(form._id));
  const isEditingArticle = kbView === 'articles' && Boolean(form._id);
  const showArticleList = kbView === 'articles' && (!isEditingArticle || articleListOpen);
  const showCategories = kbView === 'categories';

  const surface =
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.common.white, 0.05)
      : theme.palette.background.paper;
  const softSurface =
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.primary.main, 0.1)
      : alpha(theme.palette.primary.main, 0.04);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [treeResponse, articleResponse] = await Promise.all([
        adminKnowledgeBaseAPI.getTree(),
        adminKnowledgeBaseAPI.getArticles(),
      ]);
      const tree = treeResponse?.data;
      setCategories(tree?.categories || []);
      setSections(tree?.sections || []);
      setArticles(articleResponse?.data?.articles || tree?.articles || []);

      const firstActiveCategory = tree?.categories?.find((category: KnowledgeBaseCategory) => category.isActive !== false);
      if (!form.categoryId && firstActiveCategory) {
        setForm(current => ({ ...current, categoryId: firstActiveCategory._id }));
        setSectionDraft(current => ({ ...current, categoryId: firstActiveCategory._id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectArticle = (article: KnowledgeBaseArticle) => {
    setArticleListOpen(false);
    setSlugTouched(true);
    setForm({
      _id: article._id,
      categoryId: idOf(article.categoryId),
      sectionId: idOf(article.sectionId),
      title: article.title || '',
      slug: article.slug || '',
      excerpt: article.excerpt || '',
      status: article.status || 'draft',
      content: article.content || emptyDoc,
      faqBlocks: article.faqBlocks || [],
      videoEmbeds: article.videoEmbeds || [],
      imageRefs: article.imageRefs || [],
      seo: {
        title: article.seo?.title || '',
        description: article.seo?.description || '',
        keywords: article.seo?.keywords || [],
      },
      relatedArticleIds: (article.relatedArticleIds || []).map((item: any) => item._id || item),
    });
    setNotice('');
    setError('');
  };

  const resetForm = () => {
    setForm(createBlankArticle(activeCategories[0]?._id || '', ''));
    setArticleListOpen(false);
    setSlugTouched(false);
    setNotice('');
    setError('');
  };

  useEffect(() => {
    if (kbView === 'new' && form._id) {
      resetForm();
    }
    if (viewParam === 'articles' && form._id) {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbView, viewParam]);

  useEffect(() => {
    if (kbView !== 'new' || form._id || slugTouched || !form.title.trim()) return;
    const timeout = window.setTimeout(() => {
      setForm(current => ({ ...current, slug: slugifyArticleTitle(current.title) }));
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [form.title, form._id, kbView, slugTouched]);

  const saveArticle = async (publish = false) => {
    if (!form.title.trim() || !form.categoryId) {
      setError('Title and category are required');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...form,
        sectionId: form.sectionId || undefined,
        status: publish ? ('published' as KnowledgeBaseArticleStatus) : form.status,
      };
      const response = form._id
        ? await adminKnowledgeBaseAPI.updateArticle(
            form._id,
            payload as Partial<KnowledgeBaseArticle>
          )
        : await adminKnowledgeBaseAPI.createArticle(payload as Partial<KnowledgeBaseArticle>);

      const saved = response?.data;
      if (saved && publish && form._id) {
        await adminKnowledgeBaseAPI.publishArticle(form._id);
      }
      setNotice(publish ? 'Article published' : 'Article saved');
      await load();
      if (saved) selectArticle(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save article');
    } finally {
      setSaving(false);
    }
  };

  const archiveArticle = async () => {
    if (!form._id) return;
    setSaving(true);
    setError('');
    try {
      await adminKnowledgeBaseAPI.archiveArticle(form._id);
      setNotice('Article archived');
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive article');
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectedArticle = (articleId: string) => {
    setSelectedArticleIds(current =>
      current.includes(articleId) ? current.filter(id => id !== articleId) : [...current, articleId]
    );
  };

  const bulkArchiveArticles = async () => {
    if (selectedArticleIds.length === 0) return;
    const confirmed = window.confirm(`Archive ${selectedArticleIds.length} selected article(s)?`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminKnowledgeBaseAPI.bulkArchiveArticles(selectedArticleIds);
      if (form._id && selectedArticleIds.includes(form._id)) resetForm();
      setSelectedArticleIds([]);
      setNotice('Selected articles archived');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive selected articles');
    } finally {
      setSaving(false);
    }
  };

  const createCategory = async () => {
    if (!categoryDraft.name.trim()) return;
    setSaving(true);
    try {
      await adminKnowledgeBaseAPI.createCategory(categoryDraft);
      setCategoryDraft({ name: '', description: '', iconUrl: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const createSection = async () => {
    if (!sectionDraft.name.trim() || !sectionDraft.categoryId) return;
    setSaving(true);
    try {
      await adminKnowledgeBaseAPI.createSection(sectionDraft);
      setSectionDraft({ categoryId: sectionDraft.categoryId, name: '', description: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section');
    } finally {
      setSaving(false);
    }
  };

  const updateCategoryIcon = async (categoryId: string, iconUrl: string) => {
    setSaving(true);
    setError('');
    try {
      await adminKnowledgeBaseAPI.updateCategory(categoryId, { iconUrl });
      await load();
      setNotice('Category image updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category image');
    } finally {
      setSaving(false);
    }
  };

  const updateCategoryDetails = async (category: KnowledgeBaseCategory) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminKnowledgeBaseAPI.updateCategory(category._id, {
        name: category.name,
        slug: category.slug,
        description: category.description,
        iconUrl: category.iconUrl,
        isActive: category.isActive !== false,
      });
      await load();
      setNotice('Category updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const setCategoryArchived = async (category: KnowledgeBaseCategory, archived: boolean) => {
    const confirmed = archived
      ? window.confirm(`Archive category "${category.name}"? It will be hidden from default CMS lists.`)
      : true;
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminKnowledgeBaseAPI.updateCategory(category._id, { isActive: !archived });
      await load();
      setNotice(archived ? 'Category archived' : 'Category restored');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category archive state');
    } finally {
      setSaving(false);
    }
  };

  const updateFaq = (index: number, field: 'question' | 'answer', value: string) => {
    setForm(current => ({
      ...current,
      faqBlocks: current.faqBlocks.map((faq, faqIndex) =>
        faqIndex === index ? { ...faq, [field]: value } : faq
      ),
    }));
  };

  const removeFaq = (index: number) => {
    setForm(current => ({
      ...current,
      faqBlocks: current.faqBlocks.filter((_, faqIndex) => faqIndex !== index),
    }));
  };

  const uploadMedia = async (
    event: ChangeEvent<HTMLInputElement>,
    mediaType: 'image' | 'video'
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setUploadingTarget(mediaType);
    setUploadProgress(0);
    setError('');
    try {
      const response = await adminKnowledgeBaseAPI.uploadMedia(file, setUploadProgress);
      const media = response?.data;
      if (!media) throw new Error('Upload failed');

      if (mediaType === 'image') {
        setForm(current => ({
          ...current,
          imageRefs: [...current.imageRefs, { url: media.url, alt: media.fileName }],
        }));
      } else {
        setForm(current => ({
          ...current,
          videoEmbeds: [...current.videoEmbeds, { url: media.url, title: media.fileName }],
        }));
      }
      setNotice(`${mediaType === 'image' ? 'Image' : 'Video'} uploaded`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload media');
    } finally {
      setUploading(false);
      setUploadingTarget('');
      setUploadProgress(0);
    }
  };

  const uploadCategoryImage = async (event: ChangeEvent<HTMLInputElement>, categoryId?: string) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setUploadingTarget(categoryId ? `category-${categoryId}` : 'category-new');
    setUploadProgress(0);
    setError('');
    try {
      const response = await adminKnowledgeBaseAPI.uploadMedia(file, setUploadProgress);
      const media = response?.data;
      if (!media) throw new Error('Upload failed');

      if (categoryId) {
        await updateCategoryIcon(categoryId, media.url);
      } else {
        setCategoryDraft(current => ({ ...current, iconUrl: media.url }));
        setNotice('Category image uploaded');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload category image');
    } finally {
      setUploading(false);
      setUploadingTarget('');
      setUploadProgress(0);
    }
  };

  const uploadEditorImage = async (file: File) => {
    setUploading(true);
    setUploadingTarget('editor-image');
    setUploadProgress(0);
    setError('');
    try {
      const response = await adminKnowledgeBaseAPI.uploadMedia(file, setUploadProgress);
      const media = response?.data;
      if (!media) throw new Error('Upload failed');
      setNotice('Image uploaded');
      return { url: media.url, fileName: media.fileName };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload editor image');
      throw err;
    } finally {
      setUploading(false);
      setUploadingTarget('');
      setUploadProgress(0);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          borderRadius: 1,
          bgcolor: surface,
          borderColor: 'divider',
        }}
        style={{ padding: '15px 24px' }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          justifyContent="space-between"
          // spacing={2}
          alignItems={{ xs: 'stretch', lg: 'center' }}
        >
          <Box>
            <Typography
              variant="h4"
              fontWeight={950}
              color="text.primary"
              style={{ fontSize: '2rem' }}
            >
              Knowledge Base CMS
            </Typography>
            <Typography color="text.secondary">
              Manage searchable help articles, structured FAQs, and media assets.
            </Typography>
          </Box>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            flexWrap="wrap"
            useFlexGap
            sx={{ width: { xs: '100%', lg: 'auto' } }}
          >
            <Button
              component={Link}
              href="/admin/knowledge-base?view=new"
              variant="outlined"
              startIcon={<Add />}
              sx={{ minWidth: { sm: 150 } }}
            >
              New Article
            </Button>
            {showEditor && (
              <>
                <Button
                  variant="contained"
                  startIcon={<Save />}
                  onClick={() => saveArticle(false)}
                  disabled={saving}
                  sx={{ minWidth: { sm: 150 } }}
                >
                  Save Draft
                </Button>
                <Button
                  color="success"
                  variant="contained"
                  startIcon={form._id ? <Save /> : <Publish />}
                  onClick={() => saveArticle(!form._id)}
                  disabled={saving}
                  sx={{ minWidth: { sm: 150 } }}
                >
                  {form._id ? 'Update' : 'Publish'}
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>

      <RouteTabs
        ariaLabel="knowledge base sections"
        items={[
          { label: 'Categories', href: '/admin/knowledge-base?view=categories' },
          { label: 'Articles', href: '/admin/knowledge-base?view=articles' },
          { label: 'New Article', href: '/admin/knowledge-base?view=new' },
        ]}
      />

      {(loading || saving) && <LinearProgress sx={{ mb: 2 }} />}
      {uploading && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 1, bgcolor: surface }}>
          <Stack spacing={0.75}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" fontWeight={850} color="text.primary">
                Uploading media
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {uploadProgress > 0 ? `${uploadProgress}%` : 'Preparing...'}
              </Typography>
            </Stack>
            <LinearProgress
              variant={uploadProgress > 0 ? 'determinate' : 'indeterminate'}
              value={uploadProgress}
            />
          </Stack>
        </Paper>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: showCategories
              ? 'minmax(0, 1fr)'
              : showEditor && ((isEditingArticle && !articleListOpen) || kbView === 'new')
                ? 'minmax(0, 1fr)'
                : showEditor
                  ? '320px minmax(0, 1fr)'
                  : 'minmax(0, 1fr)',
            xl: showCategories
              ? 'minmax(0, 1fr)'
              : showEditor && ((isEditingArticle && !articleListOpen) || kbView === 'new')
                ? 'minmax(0, 1fr) 360px'
                : showEditor
                  ? '360px minmax(0, 1fr) 360px'
                  : 'minmax(0, 1fr)',
          },
          alignItems: 'start',
          gap: 2.5,
          width: '100%',
          maxWidth: 'none',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: kbView === 'new' || (isEditingArticle && !articleListOpen) ? 'none' : 'block',
          }}
        >
          <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: 88 }}>
            {showArticleList && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: surface }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Search fontSize="small" />
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search articles"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mb: 1.5 }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setSelectedArticleIds(
                        selectedArticleIds.length === filteredArticles.length
                          ? []
                          : filteredArticles.map(article => article._id)
                      )
                    }
                    disabled={filteredArticles.length === 0}
                  >
                    {selectedArticleIds.length === filteredArticles.length ? 'Clear' : 'Select All'}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<Delete />}
                    onClick={bulkArchiveArticles}
                    disabled={saving || selectedArticleIds.length === 0}
                  >
                    Bulk Delete
                  </Button>
                </Stack>
                <Stack spacing={1}>
                  {filteredArticles.map(articleItem => (
                    <Box
                      key={articleItem._id}
                      onClick={() => selectArticle(articleItem)}
                      sx={{
                        p: 1.4,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: form._id === articleItem._id ? 'primary.main' : 'divider',
                        cursor: 'pointer',
                        bgcolor: form._id === articleItem._id ? softSurface : 'background.paper',
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                          sx={{ minWidth: 0 }}
                        >
                          <Checkbox
                            size="small"
                            checked={selectedArticleIds.includes(articleItem._id)}
                            onClick={event => event.stopPropagation()}
                            onChange={() => toggleSelectedArticle(articleItem._id)}
                            inputProps={{
                              'aria-label': `Select ${articleItem.title || 'article'}`,
                            }}
                            sx={{ p: 0.25 }}
                          />
                          <Typography fontWeight={850} noWrap color="text.primary">
                            {articleItem.title || 'Untitled'}
                          </Typography>
                        </Stack>
                        <Chip
                          size="small"
                          label={articleItem.status}
                          color={articleItem.status === 'published' ? 'success' : 'default'}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        /{articleItem.slug} · Created {formatDate(articleItem.createdAt)}
                      </Typography>
                    </Box>
                  ))}
                  {filteredArticles.length === 0 && (
                    <Typography color="text.secondary" variant="body2">
                      No articles found.
                    </Typography>
                  )}
                </Stack>
                {filteredArchivedArticles.length > 0 && (
                  <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Archive fontSize="small" />
                      <Typography fontWeight={900}>Archived Articles</Typography>
                      <Chip size="small" label={filteredArchivedArticles.length} />
                    </Stack>
                    <Stack spacing={1}>
                      {filteredArchivedArticles.map(articleItem => (
                        <Box
                          key={articleItem._id}
                          onClick={() => selectArticle(articleItem)}
                          sx={{
                            p: 1.4,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                            bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.035) : alpha(theme.palette.text.primary, 0.025),
                          }}
                        >
                          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                            <Typography fontWeight={850} noWrap color="text.primary">
                              {articleItem.title || 'Untitled'}
                            </Typography>
                            <Chip size="small" label="archived" />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            /{articleItem.slug} · Created {formatDate(articleItem.createdAt)}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Paper>
            )}

            {showCategories && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: surface }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <ViewModule fontSize="small" />
                  <Typography fontWeight={900} color="text.primary">
                    Categories
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr)' },
                    gap: 2,
                    alignItems: 'start',
                  }}
                >
                  <Stack spacing={2}>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Typography fontWeight={900} color="text.primary" sx={{ mb: 1.5 }}>
                        Create Category
                      </Typography>
                      <Stack spacing={1.25}>
                        <TextField
                          size="small"
                          label="New category"
                          value={categoryDraft.name}
                          onChange={event =>
                            setCategoryDraft(current => ({ ...current, name: event.target.value }))
                          }
                        />
                        <TextField
                          size="small"
                          label="Description"
                          value={categoryDraft.description}
                          onChange={event =>
                            setCategoryDraft(current => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          label="Category image URL"
                          value={categoryDraft.iconUrl}
                          onChange={event =>
                            setCategoryDraft(current => ({
                              ...current,
                              iconUrl: event.target.value,
                            }))
                          }
                        />
                        {categoryDraft.iconUrl && (
                          <Box
                            component="img"
                            src={categoryDraft.iconUrl}
                            alt=""
                            sx={{
                              width: '100%',
                              aspectRatio: '16 / 9',
                              objectFit: 'cover',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          />
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          component="label"
                          startIcon={
                            uploading && uploadingTarget === 'category-new' ? (
                              <CircularProgress size={16} />
                            ) : (
                              <ImageIcon />
                            )
                          }
                          disabled={uploading}
                          fullWidth
                        >
                          {uploading && uploadingTarget === 'category-new'
                            ? `${uploadProgress || 0}%`
                            : 'Upload Category Image'}
                          <input
                            hidden
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={event => uploadCategoryImage(event)}
                          />
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Add />}
                          onClick={createCategory}
                          disabled={saving}
                          fullWidth
                        >
                          Create Category
                        </Button>
                      </Stack>
                    </Box>

                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Typography fontWeight={900} color="text.primary" sx={{ mb: 1.5 }}>
                        Create Section
                      </Typography>
                      <Stack spacing={1.25}>
                        <TextField
                          select
                          size="small"
                          label="Category"
                          value={sectionDraft.categoryId}
                          onChange={event =>
                            setSectionDraft(current => ({
                              ...current,
                              categoryId: event.target.value,
                            }))
                          }
                        >
                          {activeCategories.map(categoryItem => (
                            <MenuItem key={categoryItem._id} value={categoryItem._id}>
                              {categoryItem.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          size="small"
                          label="New section"
                          value={sectionDraft.name}
                          onChange={event =>
                            setSectionDraft(current => ({ ...current, name: event.target.value }))
                          }
                        />
                        <TextField
                          size="small"
                          label="Description"
                          value={sectionDraft.description}
                          onChange={event =>
                            setSectionDraft(current => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Add />}
                          onClick={createSection}
                          disabled={saving}
                          fullWidth
                        >
                          Create Section
                        </Button>
                      </Stack>
                    </Box>
                  </Stack>

                  <Stack spacing={1.25}>
                    {grouped.map(categoryItem => (
                      <Box
                        key={categoryItem._id}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: 1,
                              overflow: 'hidden',
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: softSurface,
                              color: 'primary.main',
                              flexShrink: 0,
                            }}
                          >
                            {categoryItem.iconUrl ? (
                              <Box
                                component="img"
                                src={categoryItem.iconUrl}
                                alt=""
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <ViewModule fontSize="small" />
                            )}
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={850} color="text.primary" noWrap>
                              {categoryItem.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {categoryItem.articles.length +
                                categoryItem.sections.reduce(
                                  (total, section) => total + section.articles.length,
                                  0
                                )}{' '}
                              articles
                            </Typography>
                          </Box>
                        </Stack>
                        {categoryItem.sections.map(section => (
                          <Typography
                            key={section._id}
                            variant="caption"
                            display="block"
                            color="text.secondary"
                            sx={{ ml: 1.5 }}
                          >
                            {section.name} · {section.articles.length} articles
                          </Typography>
                        ))}
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          <TextField
                            size="small"
                            label="Name"
                            value={categoryItem.name || ''}
                            onChange={event =>
                              setCategories(current =>
                                current.map(item =>
                                  item._id === categoryItem._id
                                    ? { ...item, name: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <TextField
                            size="small"
                            label="Slug"
                            value={categoryItem.slug || ''}
                            onChange={event =>
                              setCategories(current =>
                                current.map(item =>
                                  item._id === categoryItem._id
                                    ? { ...item, slug: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <TextField
                            size="small"
                            label="Description"
                            value={categoryItem.description || ''}
                            onChange={event =>
                              setCategories(current =>
                                current.map(item =>
                                  item._id === categoryItem._id
                                    ? { ...item, description: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <TextField
                            size="small"
                            label="Category image URL"
                            value={categoryItem.iconUrl || ''}
                            onChange={event =>
                              setCategories(current =>
                                current.map(item =>
                                  item._id === categoryItem._id
                                    ? { ...item, iconUrl: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              component="label"
                              startIcon={
                                uploading && uploadingTarget === `category-${categoryItem._id}` ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <ImageIcon />
                                )
                              }
                              disabled={uploading || saving}
                            >
                              {uploading && uploadingTarget === `category-${categoryItem._id}`
                                ? `${uploadProgress || 0}%`
                                : 'Upload'}
                              <input
                                hidden
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={event => uploadCategoryImage(event, categoryItem._id)}
                              />
                            </Button>
                            <Button
                              size="small"
                              onClick={() => updateCategoryDetails(categoryItem)}
                              disabled={saving}
                            >
                              Save
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              onClick={() => setCategoryArchived(categoryItem, true)}
                              disabled={saving}
                            >
                              Archive
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                    {archivedCategories.length > 0 && (
                      <Box sx={{ pt: 1.5, mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <Archive fontSize="small" />
                          <Typography fontWeight={900}>Archived Categories</Typography>
                          <Chip size="small" label={archivedCategories.length} />
                        </Stack>
                        <Stack spacing={1}>
                          {archivedCategories.map(categoryItem => (
                            <Box
                              key={categoryItem._id}
                              sx={{
                                p: 1.25,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.035) : alpha(theme.palette.text.primary, 0.025),
                              }}
                            >
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography fontWeight={850} noWrap>{categoryItem.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">/{categoryItem.slug}</Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => setCategoryArchived(categoryItem, false)}
                                  disabled={saving}
                                >
                                  Restore
                                </Button>
                              </Stack>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </Paper>
            )}
          </Stack>
        </Box>

        <Box sx={{ minWidth: 0, display: showEditor ? 'block' : 'none' }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 1, bgcolor: surface }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Article color="primary" />
                <Typography variant="h6" fontWeight={900} color="text.primary">
                  {form._id ? 'Edit Article' : 'New Article'}
                </Typography>
              </Stack>
              {form._id && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" variant="outlined" onClick={() => setArticleListOpen(true)}>
                    Articles
                  </Button>
                  <Tooltip title="Archive article">
                    <IconButton color="error" onClick={archiveArticle} disabled={saving}>
                      <Archive />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(220px, 5fr)' },
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <TextField
                  fullWidth
                  label="Title"
                  value={form.title}
                  onChange={event =>
                    setForm(current => ({ ...current, title: event.target.value }))
                  }
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <TextField
                  fullWidth
                  label="Slug"
                  value={form.slug}
                  onChange={event => {
                    setSlugTouched(true);
                    setForm(current => ({ ...current, slug: event.target.value }));
                  }}
                  helperText="Blank auto-generates."
                />
              </Box>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                gap: 2,
                mt: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <TextField
                  select
                  fullWidth
                  label="Category"
                  value={form.categoryId}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      categoryId: event.target.value,
                      sectionId: '',
                    }))
                  }
                >
                  {activeCategories.map(categoryItem => (
                    <MenuItem key={categoryItem._id} value={categoryItem._id}>
                      {categoryItem.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <TextField
                  select
                  fullWidth
                  label="Section"
                  value={form.sectionId}
                  onChange={event =>
                    setForm(current => ({ ...current, sectionId: event.target.value }))
                  }
                >
                  <MenuItem value="">No section</MenuItem>
                  {availableSections.map(section => (
                    <MenuItem key={section._id} value={section._id}>
                      {section.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <TextField
                  select
                  fullWidth
                  label="Status"
                  value={form.status}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      status: event.target.value as KnowledgeBaseArticleStatus,
                    }))
                  }
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="published">Published</MenuItem>
                  <MenuItem value="archived">Archived</MenuItem>
                </TextField>
              </Box>
            </Box>

            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Excerpt"
                value={form.excerpt}
                onChange={event =>
                  setForm(current => ({ ...current, excerpt: event.target.value }))
                }
              />
              <TiptapEditor
                value={form.content}
                onChange={content => setForm(current => ({ ...current, content }))}
                onUploadImage={uploadEditorImage}
              />
            </Stack>
          </Paper>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            gridColumn: { lg: showEditor ? '1 / -1' : 'auto', xl: 'auto' },
            display: showEditor ? 'block' : 'none',
          }}
        >
          <Stack spacing={2} sx={{ position: { xl: 'sticky' }, top: 88 }}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 1, bgcolor: surface }}>
              <Stack direction="row" spacing={1}>
                {[
                  { value: 'seo', label: 'SEO' },
                  { value: 'faqs', label: 'FAQs' },
                  { value: 'media', label: 'Media' },
                ].map(item => (
                  <Button
                    key={item.value}
                    fullWidth
                    variant={detailSection === item.value ? 'contained' : 'text'}
                    onClick={() => setDetailSection(item.value as 'seo' | 'faqs' | 'media')}
                  >
                    {item.label}
                  </Button>
                ))}
              </Stack>
            </Paper>

            {detailSection === 'seo' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: surface }}>
                <Typography fontWeight={900} color="text.primary" sx={{ mb: 1.5 }}>
                  SEO
                </Typography>
                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    label="SEO title"
                    value={form.seo.title}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        seo: { ...current.seo, title: event.target.value },
                      }))
                    }
                  />
                  <TextField
                    fullWidth
                    label="Keywords"
                    value={form.seo.keywords.join(', ')}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        seo: {
                          ...current.seo,
                          keywords: event.target.value
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                  />
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    label="SEO description"
                    value={form.seo.description}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        seo: { ...current.seo, description: event.target.value },
                      }))
                    }
                  />
                </Stack>
              </Paper>
            )}

            {detailSection === 'faqs' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: surface }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1.5 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <HelpOutline fontSize="small" />
                    <Typography fontWeight={900} color="text.primary">
                      FAQs
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<Add />}
                    onClick={() =>
                      setForm(current => ({
                        ...current,
                        faqBlocks: [...current.faqBlocks, { question: '', answer: '' }],
                      }))
                    }
                  >
                    Add
                  </Button>
                </Stack>
                <Stack spacing={1.5}>
                  {form.faqBlocks.map((faq, index) => (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 1, bgcolor: 'background.paper' }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="caption" color="text.secondary" fontWeight={800}>
                          FAQ {index + 1}
                        </Typography>
                        <IconButton size="small" color="error" onClick={() => removeFaq(index)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Stack spacing={1}>
                        <TextField
                          size="small"
                          label="Question"
                          value={faq.question}
                          onChange={event => updateFaq(index, 'question', event.target.value)}
                        />
                        <TextField
                          size="small"
                          multiline
                          minRows={3}
                          label="Answer"
                          value={faq.answer}
                          onChange={event => updateFaq(index, 'answer', event.target.value)}
                        />
                      </Stack>
                    </Paper>
                  ))}
                  {form.faqBlocks.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No FAQs yet.
                    </Typography>
                  )}
                </Stack>
              </Paper>
            )}

            {detailSection === 'media' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: surface }}>
                <Typography fontWeight={900} color="text.primary" sx={{ mb: 1.5 }}>
                  Media
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={
                      uploading && uploadingTarget === 'image' ? (
                        <CircularProgress size={16} />
                      ) : (
                        <ImageIcon />
                      )
                    }
                    disabled={uploading}
                  >
                    {uploading && uploadingTarget === 'image' ? `${uploadProgress || 0}%` : 'Image'}
                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={event => uploadMedia(event, 'image')}
                    />
                  </Button>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={
                      uploading && uploadingTarget === 'video' ? (
                        <CircularProgress size={16} />
                      ) : (
                        <Movie />
                      )
                    }
                    disabled={uploading}
                  >
                    {uploading && uploadingTarget === 'video' ? `${uploadProgress || 0}%` : 'Video'}
                    <input
                      hidden
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={event => uploadMedia(event, 'video')}
                    />
                  </Button>
                </Stack>
                <Stack spacing={1.5}>
                  {form.imageRefs.map((image, index) => (
                    <Paper
                      key={`${image.url}-${index}`}
                      variant="outlined"
                      sx={{ p: 1, borderRadius: 1 }}
                    >
                      <Box
                        component="img"
                        src={image.url}
                        alt={image.alt || ''}
                        sx={{
                          width: '100%',
                          aspectRatio: '16 / 9',
                          objectFit: 'cover',
                          borderRadius: 1,
                          mb: 1,
                        }}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        label="Alt text"
                        value={image.alt || ''}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            imageRefs: current.imageRefs.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, alt: event.target.value } : item
                            ),
                          }))
                        }
                      />
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() =>
                          setForm(current => ({
                            ...current,
                            imageRefs: current.imageRefs.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </Paper>
                  ))}
                  {form.videoEmbeds.map((video, index) => (
                    <Paper
                      key={`${video.url}-${index}`}
                      variant="outlined"
                      sx={{ p: 1, borderRadius: 1 }}
                    >
                      <Box
                        component="video"
                        src={video.url}
                        controls
                        sx={{ width: '100%', borderRadius: 1, mb: 1 }}
                      />
                      <TextField
                        size="small"
                        fullWidth
                        label="Title"
                        value={video.title || ''}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            videoEmbeds: current.videoEmbeds.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, title: event.target.value } : item
                            ),
                          }))
                        }
                      />
                      <Button
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() =>
                          setForm(current => ({
                            ...current,
                            videoEmbeds: current.videoEmbeds.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </Paper>
                  ))}
                  {form.imageRefs.length === 0 && form.videoEmbeds.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Upload images or videos for this article.
                    </Typography>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
