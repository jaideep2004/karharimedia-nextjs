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
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Article,
  ArrowForward,
  Close,
  DarkMode,
  GraphicEq,
  LightMode,
  Menu,
  Search,
  ExpandMore,
} from '@mui/icons-material';
import {
  knowledgeBaseAPI,
  type KnowledgeBaseArticle,
  type KnowledgeBaseCategory,
  type KnowledgeBaseSection,
  type KnowledgeBaseTree,
} from '@/services/api';
import { groupKnowledgeBase } from '@/components/knowledge-base/kbUtils';
import { useColorMode } from '@/context/ColorModeContext';

type HelpCenterClientProps = {
  mode?: 'home' | 'article' | 'category';
  slug?: string;
  categorySlug?: string;
  initialTree?: KnowledgeBaseTree;
};

function articleHref(slug: string) {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === (process.env.NEXT_PUBLIC_HELP_HOST || 'help.karharimedia.com')
  ) {
    return `/${slug}`;
  }
  return `/help/${slug}`;
}

function categoryHref(slug: string) {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === (process.env.NEXT_PUBLIC_HELP_HOST || 'help.karharimedia.com')
  ) {
    return `/category/${slug}`;
  }
  return `/help/category/${slug}`;
}

function hasTreeData(tree?: KnowledgeBaseTree) {
  return Boolean(
    tree && (tree.categories.length > 0 || tree.sections.length > 0 || tree.articles.length > 0)
  );
}

function articleFeaturedImage(article: KnowledgeBaseArticle) {
  return article.imageRefs?.find(image => image.url)?.url || '';
}

function useKnowledgeBaseSearch(query: string) {
  const [results, setResults] = useState<KnowledgeBaseArticle[]>([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      const response = await knowledgeBaseAPI.search(query.trim(), 8);
      if (active) setResults(response?.data?.articles || []);
    };
    const id = window.setTimeout(run, 250);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [query]);

  return results;
}

function SearchResultsPanel({
  results,
  panelBorder,
  panelBg,
  lightSurface = false,
}: {
  results: KnowledgeBaseArticle[];
  panelBorder: string;
  panelBg: string;
  lightSurface?: boolean;
}) {
  if (results.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        left: 0,
        right: 0,
        zIndex: 60,
        borderRadius: 1,
        overflow: 'hidden',
        borderColor: panelBorder,
        bgcolor: panelBg,
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.2)',
        color: lightSurface ? '#101820' : 'text.primary',
      }}
    >
      {results.map(article => (
        <ListItemButton key={article._id} component={Link} href={articleHref(article.slug)}>
          <Article sx={{ mr: 1.5, color: lightSurface ? alpha('#101820', 0.78) : 'inherit' }} />
          <ListItemText
            primary={article.title}
            secondary={article.excerpt}
            primaryTypographyProps={{
              color: lightSurface ? '#101820' : 'text.primary',
              fontWeight: 800,
            }}
            secondaryTypographyProps={{
              color: lightSurface ? alpha('#101820', 0.68) : 'text.secondary',
            }}
          />
        </ListItemButton>
      ))}
    </Paper>
  );
}

export function HelpSidebar({
  categories,
  sections,
  articles,
  activeSlug,
  onNavigate,
}: {
  categories: KnowledgeBaseCategory[];
  sections: KnowledgeBaseSection[];
  articles: KnowledgeBaseArticle[];
  activeSlug?: string;
  onNavigate?: () => void;
}) {
  const grouped = groupKnowledgeBase(categories, sections, articles);
  const theme = useTheme();

  return (
    <Box sx={{ width: 292, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <GraphicEq color="primary" />
        <Box>
          <Typography fontWeight={950}>Karhari Media Distribution Help</Typography>
          <Typography variant="caption" color="text.secondary">
            Knowledge base
          </Typography>
        </Box>
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <List disablePadding sx={{ display: 'grid', gap: 1 }}>
        {grouped.map(category => (
          <Accordion
            key={category._id}
            defaultExpanded={
              category.articles.some(article => activeSlug === article.slug) ||
              category.sections.some(section =>
                section.articles.some(article => activeSlug === article.slug)
              )
            }
            disableGutters
            elevation={0}
            sx={{
              bgcolor: 'transparent',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMore />}
              sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 1 } }}
            >
              <Typography fontWeight={900} sx={{ fontSize: 13 }}>
                {category.name}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, px: 1, pb: 1 }}>
              {category.articles.map(article => (
                <ListItemButton
                  key={article._id}
                  component={Link}
                  href={articleHref(article.slug)}
                  onClick={onNavigate}
                  selected={activeSlug === article.slug}
                  sx={{
                    borderRadius: 1,
                    minHeight: 40,
                    color: 'text.primary',
                    '&.Mui-selected': {
                      bgcolor: alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'dark' ? 0.22 : 0.1
                      ),
                    },
                  }}
                >
                  <ListItemText
                    primary={article.title}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: 700 }}
                  />
                </ListItemButton>
              ))}
              {category.sections.map(section => (
                <Box key={section._id} sx={{ mt: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ px: 1.25, color: 'text.secondary', fontWeight: 850 }}
                  >
                    {section.name}
                  </Typography>
                  {section.articles.map(article => (
                    <ListItemButton
                      key={article._id}
                      component={Link}
                      href={articleHref(article.slug)}
                      onClick={onNavigate}
                      selected={activeSlug === article.slug}
                      sx={{
                        borderRadius: 1,
                        minHeight: 40,
                        pl: 2,
                        color: 'text.primary',
                        '&.Mui-selected': {
                          bgcolor: alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.22 : 0.1
                          ),
                        },
                      }}
                    >
                      <ListItemText
                        primary={article.title}
                        primaryTypographyProps={{ fontSize: 14, fontWeight: 700 }}
                      />
                    </ListItemButton>
                  ))}
                </Box>
              ))}
              {category.articles.length === 0 &&
                category.sections.every(section => section.articles.length === 0) && (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 1, pb: 1 }}>
                    No articles.
                  </Typography>
                )}
            </AccordionDetails>
          </Accordion>
        ))}
      </List>
    </Box>
  );
}

export default function HelpCenterClient({
  mode = 'home',
  slug,
  categorySlug,
  initialTree,
}: HelpCenterClientProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mode: colorMode, toggleColorMode } = useColorMode();
  const [categories, setCategories] = useState<KnowledgeBaseCategory[]>(
    initialTree?.categories || []
  );
  const [sections, setSections] = useState<KnowledgeBaseSection[]>(initialTree?.sections || []);
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>(initialTree?.articles || []);
  const [headerSearch, setHeaderSearch] = useState('');
  const [heroSearch, setHeroSearch] = useState('');
  const [loading, setLoading] = useState(!hasTreeData(initialTree));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState('');

  const isDark = colorMode === 'dark';
  const grouped = useMemo(
    () => groupKnowledgeBase(categories, sections, articles),
    [categories, sections, articles]
  );
  const activeCategory = useMemo(
    () => grouped.find(category => category.slug === categorySlug),
    [grouped, categorySlug]
  );
  const headerResults = useKnowledgeBaseSearch(headerSearch);
  const heroResults = useKnowledgeBaseSearch(heroSearch);

  useEffect(() => {
    if (hasTreeData(initialTree)) return;

    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await knowledgeBaseAPI.getTree();
        if (!active) return;
        setCategories(response?.data?.categories || []);
        setSections(response?.data?.sections || []);
        setArticles(response?.data?.articles || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load help center');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [initialTree]);

  const sidebar = (
    <HelpSidebar
      categories={categories}
      sections={sections}
      articles={articles}
      activeSlug={slug}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  const pageBg = isDark ? '#081112' : '#f6f2ea';
  const headerBg = isDark ? alpha('#081112', 0.95) : alpha('#f6f2ea', 0.96);
  const panelBg = isDark ? alpha('#f8f0df', 0.07) : '#ffffff';
  const panelBorder = isDark ? alpha('#f8f0df', 0.14) : alpha('#101820', 0.12);
  const heroBg =
    'radial-gradient(circle 600px at 80% 20%, rgb(166 23 226 / 18%) 0%, transparent 60%), radial-gradient(circle 500px at 10% 80%, rgb(162 25 85 / 22%) 0%, transparent 60%), radial-gradient(circle 700px at 50% 50%, rgba(83, 12, 195, 0.07) 0%, transparent 70%), #05050A';

  const renderSearchField = (
    value: string,
    onChange: (value: string) => void,
    results: KnowledgeBaseArticle[],
    elevated = false
  ) => ( 
    <Box sx={{ position: 'relative' }}>    
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Search help articles"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            minHeight: elevated ? 56 : 44,
            bgcolor: elevated ? '#ffffff' : isDark ? alpha('#f8f0df', 0.08) : '#ffffff',
            color: elevated ? '#101820' : isDark ? '#f8f0df' : '#101820',
            borderRadius: 1,
            fontSize: elevated ? 17 : undefined,
            boxShadow: elevated ? '0 18px 44px rgba(0, 0, 0, 0.2)' : undefined,
          },
          '& .MuiSvgIcon-root': {
            color: elevated
              ? alpha('#101820', 0.72)
              : isDark
                ? alpha('#f8f0df', 0.9)
                : alpha('#101820', 0.72),
          },
          '& .MuiInputBase-input': {
            color: elevated ? '#101820' : isDark ? '#f8f0df' : '#101820',
          },
          '& .MuiInputBase-input::placeholder': {
            color: elevated
              ? alpha('#101820', 0.58)
              : isDark
                ? alpha('#f8f0df', 0.7)
                : alpha('#101820', 0.58),
            opacity: 1,
          },
        }}
      />
      <SearchResultsPanel
        results={results}
        panelBorder={panelBorder}
        panelBg={elevated ? '#ffffff' : panelBg}
        lightSurface={elevated}
      />
    </Box>
  );

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
            {isMobile && mode === 'article' && (
              <IconButton onClick={() => setMobileOpen(true)} aria-label="Open help navigation">
                <Menu />
              </IconButton>
            )}
            <Box
              component={Link}
              href="/help"
              sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}
            >
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
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flex: 1, justifyContent: 'flex-end', minWidth: 0 }}
          >
            <Box sx={{ width: { sm: 280, md: 360 }, display: { xs: 'none', sm: 'block' } }}>
              {renderSearchField(headerSearch, setHeaderSearch, headerResults)}
            </Box>
            <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
              <IconButton
                onClick={toggleColorMode}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <LightMode /> : <DarkMode />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Box sx={{ display: { xs: 'block', sm: 'none' }, px: 2, pb: 1.5 }}>
          {renderSearchField(headerSearch, setHeaderSearch, headerResults)}
        </Box>
      </Box>

      {mode === 'article' && (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
          <Stack direction="row" justifyContent="flex-end" sx={{ p: 1 }}>
            <IconButton onClick={() => setMobileOpen(false)}>
              <Close />
            </IconButton>
          </Stack>
          {sidebar}
        </Drawer>
      )}

      <Box component="main">
        {loading ? (
          <Stack alignItems="center" sx={{ py: 10 }}>
            <CircularProgress />
          </Stack>
        ) : error ? (
          <Box sx={{ px: 2, py: 4 }}>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 1, maxWidth: 760, mx: 'auto' }}>
              <Typography color="error">{error}</Typography>
            </Paper>
          </Box>
        ) : mode === 'home' ? (
          <Stack spacing={{ xs: 3, md: 5 }}>
            <Box
              sx={{
                color: 'white',
                bgcolor: '#05050A',
                background: heroBg,
                backgroundSize: 'auto',
                display: 'grid',
                placeItems: 'center',
                px: 2,
                py: { xs: 4, md: 5.5 },
                borderBottom: '1px solid',
                borderColor: alpha('#f8f0df', 0.12),
                minHeight: '300px',
              }}
            >
              <Stack
                spacing={2.5}
                alignItems="center"
                sx={{ width: '100%', maxWidth: 920, textAlign: 'center' }}
              >
                <Typography
                  component="h1"
                  sx={{
                    fontSize: { xs: '2.1rem', sm: '2.75rem', md: '3.35rem' },
                    lineHeight: 1.05,
                    fontWeight: 950,
                    letterSpacing: 0,
                  }}
                >
                  How can we help you?
                </Typography>
                <Box sx={{ width: '100%', maxWidth: 760 }}>
                  {renderSearchField(heroSearch, setHeroSearch, heroResults, true)}
                </Box>
              </Stack>
            </Box>

            <Box
              sx={{ width: '100%', mx: 'auto', px: { xs: 2, md: 4 } }}
              style={{ paddingBottom: '50px' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: { xs: 2, md: 2.5 },
                  mx: 'auto',
                }}
              >
                {grouped.map(category => {
                  const categoryArticles = [
                    ...category.articles,
                    ...category.sections.flatMap(section => section.articles),
                  ];

                  return (
                    <Paper
                      key={category._id}
                      component={Link}
                      href={categoryHref(category.slug)}
                      variant="outlined"
                      sx={{
                        textAlign: 'left',
                        p: { xs: 2.5, md: 3 },
                        borderRadius: 1,
                        minHeight: 190,
                        flex: {
                          xs: '1 1 100%',
                          sm: '0 1 calc((100% - 16px) / 2)',
                          lg: '0 1 calc((100% - 40px) / 3)',
                          xl: '0 1 calc((100% - 60px) / 4)',
                        },
                        maxWidth: { xs: 420, sm: 'none' },
                        bgcolor: panelBg,
                        borderColor: panelBorder,
                        color: 'text.primary',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isDark ? 'none' : '0 18px 42px rgba(16, 24, 32, 0.08)',
                        transition:
                          'transform 180ms ease, border-color 180ms ease, background-color 180ms ease',
                        '&:hover': {
                          transform: 'translateY(-3px)',
                          borderColor: 'primary.main',
                          bgcolor: isDark ? alpha('#f8f0df', 0.1) : '#ffffff',
                        },
                        '&:focus-visible': {
                          outline: '3px solid',
                          outlineColor: alpha(theme.palette.primary.main, 0.45),
                          outlineOffset: 3,
                        },
                      }}
                    >
                      <Box>
                        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 46,
                              height: 46,
                              borderRadius: category.iconUrl ? 1 : '50%',
                              overflow: 'hidden',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#ffffff',
                            }}
                          >
                            {category.iconUrl ? (
                              <Box
                                component="img"
                                src={category.iconUrl}
                                alt=""
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <GraphicEq />
                            )}
                          </Box>
                          <Typography variant="h5" fontWeight={950}>
                            {category.name}
                          </Typography>
                        </Stack>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>
                          {category.description || 'Guides and reference material.'}
                        </Typography>
                      </Box>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ color: 'primary.main' }}
                      >
                        <Typography variant="body2" fontWeight={900}>
                          {categoryArticles.length}{' '}
                          {categoryArticles.length === 1 ? 'article' : 'articles'}
                        </Typography>
                        <ArrowForward fontSize="small" />
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
              {articles.length === 0 && (
                <Paper
                  variant="outlined"
                  sx={{ p: 4, mt: 3, borderRadius: 1, bgcolor: panelBg, borderColor: panelBorder }}
                >
                  <Typography fontWeight={900}>No published help articles yet.</Typography>
                  <Typography color="text.secondary">
                    Publish articles from Admin to Knowledge Base CMS.
                  </Typography>
                </Paper>
              )}
            </Box>
          </Stack>
        ) : mode === 'category' ? (
          <Stack spacing={0}>
            <Box
              sx={{
                width: '100%',
                maxWidth: 1180,
                mx: 'auto',
                px: { xs: 2, md: 4 },
                py: { xs: 4, md: 6 },
              }}
            >
              {activeCategory ? (
                <Stack spacing={3}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                  >
                    <Box
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: activeCategory.iconUrl ? 1 : '50%',
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#ffffff',

                        flexShrink: 0,
                      }}
                    >
                      {activeCategory.iconUrl ? (
                        <Box
                          component="img"
                          src={activeCategory.iconUrl}
                          alt=""
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <GraphicEq fontSize="large" />
                      )}
                    </Box>
                    <Box>
                      <Typography
                        component="h1"
                        sx={{
                          fontSize: { xs: '2.1rem', md: '3rem' },
                          lineHeight: 1.05,
                          fontWeight: 950,
                          letterSpacing: 0,
                        }}
                      >
                        {activeCategory.name}
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 1, fontSize: { xs: 16, md: 18 } }}>
                        {activeCategory.description || 'Guides and reference material.'}
                      </Typography>
                    </Box>
                  </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                    gap: 2.5,
                  }}
                >
                  {activeCategory.articles.length > 0 && (
                    <Paper
                      variant="outlined"
                      sx={{ p: 2.5, borderRadius: 1, bgcolor: panelBg, borderColor: panelBorder }}
                    >
                      <Typography
                        variant="overline"
                        fontWeight={900}
                        color="text.secondary"
                        sx={{ letterSpacing: 0 }}
                      >
                        Articles
                      </Typography>
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        {activeCategory.articles.map(article => {
                          const imageUrl = articleFeaturedImage(article);
                          return (
                            <Paper
                              key={article._id}
                              component={Link}
                              href={articleHref(article.slug)}
                              variant="outlined"
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: imageUrl
                                  ? '96px minmax(0, 1fr) auto'
                                  : 'minmax(0, 1fr) auto',
                                gap: 1.5,
                                alignItems: 'center',
                                p: 1,
                                borderRadius: 1,
                                borderColor: panelBorder,
                                color: 'text.primary',
                                textDecoration: 'none',
                              }}
                            >
                              {imageUrl && (
                                <Box
                                  component="img"
                                  src={imageUrl}
                                  alt=""
                                  sx={{
                                    width: 96,
                                    height: 64,
                                    objectFit: 'cover',
                                    borderRadius: 1,
                                  }}
                                />
                              )}
                              <Typography fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>
                                {article.title}
                              </Typography>
                              <ArrowForward fontSize="small" color="primary" />
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  )}
                  {activeCategory.sections.map(section => (
                    <Paper
                      key={section._id}
                      variant="outlined"
                      sx={{ p: 2.5, borderRadius: 1, bgcolor: panelBg, borderColor: panelBorder }}
                    >
                      <Typography
                        variant="overline"
                        fontWeight={900}
                        color="text.secondary"
                        sx={{ letterSpacing: 0 }}
                      >
                        {section.name}
                      </Typography>
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        {section.articles.map(article => {
                          const imageUrl = articleFeaturedImage(article);
                          return (
                            <Paper
                              key={article._id}
                              component={Link}
                              href={articleHref(article.slug)}
                              variant="outlined"
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: imageUrl
                                  ? '96px minmax(0, 1fr) auto'
                                  : 'minmax(0, 1fr) auto',
                                gap: 1.5,
                                alignItems: 'center',
                                p: 1,
                                borderRadius: 1,
                                borderColor: panelBorder,
                                color: 'text.primary',
                                textDecoration: 'none',
                              }}
                            >
                              {imageUrl && (
                                <Box
                                  component="img"
                                  src={imageUrl}
                                  alt=""
                                  sx={{
                                    width: 96,
                                    height: 64,
                                    objectFit: 'cover',
                                    borderRadius: 1,
                                  }}
                                />
                              )}
                              <Typography fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>
                                {article.title}
                              </Typography>
                              <ArrowForward fontSize="small" color="primary" />
                            </Paper>
                          );
                        })}
                        {section.articles.length === 0 && (
                          <Typography variant="body2" color="text.secondary">
                            No published articles in this section yet.
                          </Typography>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Box>
                {activeCategory.articles.length === 0 &&
                  activeCategory.sections.every(section => section.articles.length === 0) && (
                    <Paper
                      variant="outlined"
                      sx={{ p: 4, borderRadius: 1, bgcolor: panelBg, borderColor: panelBorder }}
                    >
                      <Typography color="text.secondary">
                        No published articles in this category yet.
                      </Typography>
                    </Paper>
                  )}
                </Stack>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{ p: 4, borderRadius: 1, bgcolor: panelBg, borderColor: panelBorder }}
                >
                  <Typography fontWeight={900}>Category not found.</Typography>
                  <Button component={Link} href="/help" sx={{ mt: 1 }}>
                    Back to help center
                  </Button>
                </Paper>
              )}
            </Box>
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
}
