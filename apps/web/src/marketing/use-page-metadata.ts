import { useEffect } from 'react';

export const marketingSiteUrl = 'https://agendei.site';

export type StructuredData = Record<string, unknown>;

interface PageMetadata {
  title: string;
  description: string;
  path: string;
  robots?: 'index,follow' | 'noindex,nofollow';
  image?: string;
  type?: 'website';
  structuredData?: StructuredData | StructuredData[];
}

function absoluteUrl(path: string) {
  return new URL(path, `${marketingSiteUrl}/`).toString();
}

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element === null) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (element === null) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.append(element);
  }
  element.href = href;
}

/** Metadata exclusiva das páginas comerciais, preparada para páginas futuras por rota. */
export function usePageMetadata({
  title,
  description,
  path,
  robots = 'index,follow',
  image = '/og.png',
  type = 'website',
  structuredData = [],
}: PageMetadata) {
  useEffect(() => {
    const canonical = absoluteUrl(path);
    const socialImage = absoluteUrl(image);
    document.title = title;
    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="robots"]', 'name', 'robots', robots);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', socialImage);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'Agendei');
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'pt_BR');
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', socialImage);
    upsertLink('canonical', canonical);

    const data = Array.isArray(structuredData) ? structuredData : [structuredData];
    document.head.querySelectorAll('script[data-marketing-structured-data]').forEach((element) => {
      element.remove();
    });
    data.forEach((item, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.marketingStructuredData = String(index);
      script.text = JSON.stringify(item);
      document.head.append(script);
    });
  }, [description, image, path, robots, structuredData, title, type]);
}
