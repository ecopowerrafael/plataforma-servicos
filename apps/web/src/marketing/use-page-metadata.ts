import { useEffect } from 'react';

interface PageMetadata {
  title: string;
  description: string;
  path: string;
}

function upsertMeta(
  selector: string,
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element === null) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

export function usePageMetadata({ title, description, path }: PageMetadata) {
  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    const image = new URL('/og.png', window.location.origin).toString();
    document.title = title;
    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical === null) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = url;

    let structuredData = document.head.querySelector<HTMLScriptElement>(
      'script[data-marketing-structured-data]',
    );
    if (structuredData === null) {
      structuredData = document.createElement('script');
      structuredData.type = 'application/ld+json';
      structuredData.dataset.marketingStructuredData = 'true';
      document.head.append(structuredData);
    }
    structuredData.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Plataforma de Serviços',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      url,
    });
  }, [description, path, title]);
}
