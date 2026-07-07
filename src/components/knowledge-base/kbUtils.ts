import type { KnowledgeBaseArticle, KnowledgeBaseCategory, KnowledgeBaseSection } from '@/services/api';

export function getEntityName(entity?: string | { name?: string } | null) {
  return typeof entity === 'object' && entity?.name ? entity.name : '';
}

export function groupKnowledgeBase(
  categories: KnowledgeBaseCategory[],
  sections: KnowledgeBaseSection[],
  articles: KnowledgeBaseArticle[]
) {
  return categories.map((category) => {
    const categoryId = category._id;
    const categorySections = sections.filter((section) => String(section.categoryId) === categoryId);
    const categoryArticles = articles.filter((article) => {
      const articleCategoryId = typeof article.categoryId === 'string' ? article.categoryId : article.categoryId?._id;
      return articleCategoryId === categoryId && !article.sectionId;
    });

    return {
      ...category,
      sections: categorySections.map((section) => ({
        ...section,
        articles: articles.filter((article) => {
          const sectionId = typeof article.sectionId === 'string' ? article.sectionId : article.sectionId?._id;
          return sectionId === section._id;
        }),
      })),
      articles: categoryArticles,
    };
  });
}

export function extractHeadings(html = '') {
  if (typeof window === 'undefined') return [] as Array<{ id: string; text: string }>;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('h2, h3')).map((heading, index) => {
    const text = heading.textContent || `Section ${index + 1}`;
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `section-${index + 1}`;
    return { id, text };
  });
}

export function addHeadingIds(html = '') {
  if (typeof window === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('h2, h3').forEach((heading, index) => {
    const text = heading.textContent || `Section ${index + 1}`;
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `section-${index + 1}`;
    heading.setAttribute('id', id);
  });
  return doc.body.innerHTML;
}
