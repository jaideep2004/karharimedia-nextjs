'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import {
  Article,
  Close,
  DarkMode,
  LightMode,
  Menu,
  Search,
  ExpandMore,
} from '@mui/icons-material';
import {
  knowledgeBaseAPI,
  type KnowledgeBaseArticle,
  type KnowledgeBaseTree,
} from '@/services/api';
import { HelpSidebar } from '@/components/knowledge-base/HelpCenterClient';
import { addHeadingIds, extractHeadings } from '@/components/knowledge-base/kbUtils';
import { useColorMode } from '@/context/ColorModeContext';

function articleHref(slug: string) {
  if (typeof window !== 'undefined' && window.location.hostname === (process.env.NEXT_PUBLIC_HELP_HOST || 'help.karharimedia.com')) {
    return `/${slug}`;
  }
  return `/help/${slug}`;
}

function hasTreeData(tree?: KnowledgeBaseTree) {
  return Boolean(tree && (tree.categories.length > 0 || tree.sections.length > 0 || tree.articles.length > 0));
}

function youtubeEmbedUrl(value?: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const embedMatch = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)/);
      if (embedMatch?.[1]) return `https://www.youtube-nocookie.com/embed/${embedMatch[1]}`;

      const watchId = url.searchParams.get('v');
      if (watchId) return `https://www.youtube-nocookie.com/embed/${watchId}`;

      const shortsMatch = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
      if (shortsMatch?.[1]) return `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}`;
    }

    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
  } catch {
    return '';
  }
  return '';
}

function normalizeArticleVideos(html: string) {
  return html.replace(/<iframe([^>]*?)src="([^"]+)"([^>]*)>/g, (match, before, src, after) => {
    const embedUrl = youtubeEmbedUrl(src);
    return embedUrl ? `<iframe${before}src="${embedUrl}"${after}>` : match;
  });
}

export default function HelpArticleClient({
  slug,
  initialArticle,
  initialTree,
}: {
  slug: string;
  initialArticle?: KnowledgeBaseArticle | null;
  initialTree?: KnowledgeBaseTree;
}) {
  const { mode, toggleColorMode } = useColorMode();
  const isDark = mode === 'dark';
  const [article, setArticle] = useState<KnowledgeBaseArticle | null>(initialArticle || null);
  const [categories, setCategories] = useState(initialTree?.categories || []);
  const [sections, setSections] = useState(initialTree?.sections || []);
  const [articles, setArticles] = useState(initialTree?.articles || []);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(!initialArticle);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (initialArticle && hasTreeData(initialTree)) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const articlePromise: Promise<{ data?: KnowledgeBaseArticle | null }> = initialArticle
          ? Promise.resolve({ data: initialArticle })
          : knowledgeBaseAPI.getArticle(slug);
        const treePromise: Promise<{ data?: KnowledgeBaseTree }> = hasTreeData(initialTree)
          ? Promise.resolve({ data: initialTree })
          : knowledgeBaseAPI.getTree();
        const [articleResponse, treeResponse] = await Promise.all([articlePromise, treePromise]);
        if (!active) return;
        setArticle(articleResponse?.data || null);
        setCategories(treeResponse?.data?.categories || []);
        setSections(treeResponse?.data?.sections || []);
        setArticles(treeResponse?.data?.articles || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Article not found');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [initialArticle, initialTree, slug]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (search.trim().length < 2) {
        setResults([]);
        return;
      }
      const response = await knowledgeBaseAPI.search(search.trim(), 8);
      if (active) setResults(response?.data?.articles || []);
    };
    const id = window.setTimeout(run, 250);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [search]);

  const html = useMemo(
    () => normalizeArticleVideos(addHeadingIds(article?.contentHtml || '')),
    [article?.contentHtml]
  );
  const headings = useMemo(() => extractHeadings(article?.contentHtml || ''), [article?.contentHtml]);
  const relatedArticles = useMemo(
    () => (article?.relatedArticleIds || []).filter((related): related is KnowledgeBaseArticle => typeof related !== 'string'),
    [article?.relatedArticleIds]
  );
  const pageBg = isDark ? '#081112' : '#f6f2ea';
  const headerBg = isDark ? alpha('#081112', 0.95) : alpha('#f6f2ea', 0.96);
  const articleBg = isDark ? alpha('#f8f0df', 0.07) : '#ffffff';
  const panelBorder = isDark ? alpha('#f8f0df', 0.14) : alpha('#101820', 0.12);

  const sidebar = (
    <HelpSidebar
      categories={categories}
      sections={sections}
      articles={articles}
      activeSlug={slug}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  const searchField = (
    <TextField
      fullWidth
      size="small"
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="Search help articles"
      InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
      sx={{
        '& .MuiOutlinedInput-root': {
          minHeight: 44,
          bgcolor: isDark ? alpha('#f8f0df', 0.08) : '#ffffff',
        },
      }}
    />
  );

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: pageBg }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!article || error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: pageBg, p: 3 }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 1 }}>
          <Typography fontWeight={900}>Article not found</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{error || 'This article is not published.'}</Typography>
          <Button component={Link} href="/help">Back to Help Center</Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg, color: 'text.primary' }}>
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          borderBottom: '1px solid',
          borderColor: panelBorder,
          bgcolor: headerBg,
          backdropFilter: 'blur(14px)',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ px: { xs: 2, md: 4 }, py: 1.25, minHeight: 68 }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
            <IconButton onClick={() => setMobileOpen(true)} aria-label="Open help navigation" sx={{ display: { lg: 'none' } }}>
              <Menu />
            </IconButton>
            <Box component={Link} href="/help" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
              <Box
                component="img"
                src={isDark ? '/images/karhari-media-b1.png' : '/images/karhari-media-b1.png'}
                alt="Karhari Media Distribution"
                sx={{
                  width: { xs: 168, sm: 210 },
                  height: 42,
                  objectFit: 'contain',
                  objectPosition: 'left center',
                  display: 'block',
                }}
              />
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
            <Box sx={{ width: { sm: 280, md: 360 }, display: { xs: 'none', sm: 'block' } }}>
              {searchField}
            </Box>
            <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
              <IconButton onClick={toggleColorMode} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
                {isDark ? <LightMode /> : <DarkMode />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 2, pb: 1.5 }}>
          {searchField}
        </Box>
        {results.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              position: 'absolute',
              right: { xs: 16, sm: 72 },
              top: { xs: 124, sm: 60 },
              width: { xs: 'calc(100% - 32px)', sm: 420 },
              zIndex: 25,
              borderRadius: 1,
              overflow: 'hidden',
              borderColor: panelBorder,
            }}
          >
            {results.map((result) => (
              <ListItemButton key={result._id} component={Link} href={articleHref(result.slug)}>
                <Article sx={{ mr: 1.5 }} />
                <ListItemText primary={result.title} secondary={result.excerpt} />
              </ListItemButton>
            ))}
          </Paper>
        )}
      </Box>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
          <IconButton onClick={() => setMobileOpen(false)}><Close /></IconButton>
        </Stack>
        {sidebar}
      </Drawer>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: '320px minmax(0, 1fr)',
          },
          gap: { xs: 0, lg: 3 },
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          width: '100%',
        }}
      >
        <Box
          sx={{
            display: { xs: 'none', lg: 'block' },
            position: 'sticky',
            top: 92,
            alignSelf: 'start',
            minWidth: 0,
          }}
        >
          <Stack spacing={2}>
            {sidebar}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, bgcolor: articleBg, borderColor: panelBorder }}>
              <Typography variant="overline" color="text.secondary" fontWeight={900} sx={{ letterSpacing: 0 }}>On this page</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {headings.length > 0 ? headings.map((heading) => (
                  <Button key={heading.id} href={`#${heading.id}`} size="small" sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                    {heading.text}
                  </Button>
                )) : (
                  <Typography variant="body2" color="text.secondary">Article overview</Typography>
                )}
              </Stack>
              {relatedArticles.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="overline" color="text.secondary" fontWeight={900} sx={{ letterSpacing: 0 }}>Related</Typography>
                  {relatedArticles.map((related) => (
                    <Button key={related._id} component={Link} href={articleHref(related.slug)} size="small" sx={{ justifyContent: 'flex-start', display: 'flex', textAlign: 'left' }}>
                      {related.title}
                    </Button>
                  ))}
                </>
              )}
            </Paper>
          </Stack>
        </Box>
        <Paper
          component="article"
          variant="outlined"
          sx={{
            minWidth: 0,
            p: { xs: 2.5, md: 4 },
            borderRadius: 1,
            bgcolor: articleBg,
            borderColor: panelBorder,
            color: 'text.primary',
            '& .kb-article h2, & .kb-article h3': { scrollMarginTop: 96, mt: 3, mb: 1, color: 'text.primary' },
            '& .kb-article p': { lineHeight: 1.8, fontSize: 16, color: 'text.primary' },
            '& .kb-article li': { color: 'text.primary' },
            '& .kb-article a': { color: 'primary.main', fontWeight: 700 },
            '& .kb-article table': { width: '100%', borderCollapse: 'collapse', my: 2, display: 'block', overflowX: 'auto' },
            '& .kb-article td, & .kb-article th': { border: '1px solid rgba(24,32,31,0.18)', p: 1 },
            '& .kb-article blockquote': { borderLeft: '4px solid #E46D4E', pl: 2, color: 'text.secondary' },
            '& .kb-article img': { maxWidth: '100%', borderRadius: 1 },
            '& .kb-video': { maxWidth: '100%' },
            '& .kb-video iframe': { width: '100%', aspectRatio: '16 / 9', border: 0 },
          }}
        >
          <Button component={Link} href="/help" size="small" sx={{ mb: 2 }}>Help Center</Button>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '2rem', md: '3rem' },
              lineHeight: 1.08,
              fontWeight: 950,
              letterSpacing: 0,
              mb: 1,
            }}
          >
            {article.title}
          </Typography>
          {article.excerpt && <Typography color="text.secondary" sx={{ mb: 3 }}>{article.excerpt}</Typography>}
          <Divider sx={{ mb: 3 }} />
          <Box className="kb-article" dangerouslySetInnerHTML={{ __html: html }} />
          {((article.imageRefs || []).length > 0 || (article.videoEmbeds || []).length > 0) && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h5" fontWeight={900} color="text.primary" sx={{ mb: 1.5 }}>Media</Typography>
              <Stack spacing={2}>
                {article.imageRefs?.map((image, index) => (
                  <Box
                    key={`${image.url}-${index}`}
                    component="img"
                    src={image.url}
                    alt={image.alt || ''}
                    sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: panelBorder }}
                  />
                ))}
                {article.videoEmbeds?.map((video, index) => (
                  youtubeEmbedUrl(video.url) ? (
                    <Box
                      key={`${video.url}-${index}`}
                      className="kb-video"
                      sx={{ borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: panelBorder }}
                    >
                      <Box
                        component="iframe"
                        src={youtubeEmbedUrl(video.url)}
                        title={video.title || 'Embedded video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        sx={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 0 }}
                      />
                    </Box>
                  ) : (
                    <Box
                      key={`${video.url}-${index}`}
                      component="video"
                      src={video.url}
                      controls
                      sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: panelBorder }}
                    />
                  )
                ))}
              </Stack>
            </Box>
          )}
          {(article.faqBlocks || []).length > 0 && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h5" fontWeight={900} sx={{ mb: 1.5 }}>FAQs</Typography>
              <Stack spacing={1.5}>
                {article.faqBlocks?.map((faq, index) => (
                  <Accordion
                    key={`${faq.question}-${index}`}
                    disableGutters
                    elevation={0}
                    sx={{
                      bgcolor: articleBg,
                      border: '1px solid',
                      borderColor: panelBorder,
                      borderRadius: 1,
                      '&:before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Typography fontWeight={850} color="text.primary">{faq.question}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography color="text.secondary">{faq.answer}</Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
