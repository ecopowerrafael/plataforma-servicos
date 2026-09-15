import { existsSync, readFileSync } from 'node:fs';

import { PublicTenantManifestSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const readWeb = (path: string) =>
  readFileSync(new URL(`../../../../web/src/${path}`, import.meta.url), 'utf8');

const serviceWorker = readFileSync(
  new URL('../../../../web/public/push-service-worker.js', import.meta.url),
  'utf8',
);
const publicPage = readWeb('routes/PublicTenantPage.tsx');
const install = readWeb('components/public/PwaInstall.tsx');
/** O ciclo de vida do prompt foi centralizado no hook compartilhado. */
const installHook = readWeb('components/public/use-pwa-install.ts');
const pushHook = readWeb('components/public/use-push-subscription.ts');
const reminderCta = readWeb('components/public/PushReminderCta.tsx');
const service = readFileSync(new URL('./tenant-white-label.service.ts', import.meta.url), 'utf8');
const notifications = readFileSync(
  new URL('../notifications/notification.service.ts', import.meta.url),
  'utf8',
);

/** Manifest equivalente ao que o serviço monta, para validar o contrato. */
const manifestFor = (publicId: string, slug: string, name: string, hasIcon: boolean) =>
  PublicTenantManifestSchema.parse({
    id: `/pwa/tenant/${publicId}`,
    name,
    short_name: name.slice(0, 30),
    description: null,
    theme_color: '#123456',
    background_color: '#ffffff',
    icons: hasIcon
      ? [
          {
            src: `/public/sites/${slug}/app-icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `/public/sites/${slug}/app-icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ]
      : [],
    display: 'standalone',
    scope: `/public/${slug}`,
    start_url: `/public/${slug}`,
  });

describe('manifest do tenant', () => {
  it('mantém o id quando slug, nome e ícone mudam', () => {
    const before = manifestFor('tenant-uuid', 'barbearia-silva', 'Barbearia Silva', true);
    const after = manifestFor('tenant-uuid', 'silva-barber', 'Silva Barber', true);

    expect(after.id).toBe(before.id);
    expect(after.start_url).not.toBe(before.start_url);
  });

  it('distingue tenants diferentes na mesma origem', () => {
    expect(manifestFor('a', 'um', 'Um', false).id).not.toBe(manifestFor('b', 'dois', 'Dois', false).id);
  });

  it('usa caminhos da origem web em id, scope e start_url', () => {
    const manifest = manifestFor('tenant-uuid', 'barbearia', 'Barbearia', true);
    for (const value of [manifest.id, manifest.scope, manifest.start_url])
      expect(value.startsWith('/')).toBe(true);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it('declara um arquivo real por tamanho, sem sizes múltiplos', () => {
    const [small, large] = manifestFor('t', 'loja', 'S', true).icons;
    expect(small).toMatchObject({ src: '/public/sites/loja/app-icon-192.png', sizes: '192x192' });
    expect(large).toMatchObject({ src: '/public/sites/loja/app-icon-512.png', sizes: '512x512' });
    expect(small?.src).not.toBe(large?.src);
    expect(service).not.toContain("'192x192 512x512'");
  });

  it('é montado a partir do publicId imutável do tenant', () => {
    expect(service).toContain('id: `/pwa/tenant/${tenant.publicId}`');
    expect(service).not.toContain('id: `/pwa/tenant/${site.slug}`');
  });

  it('o link do manifest não aponta para a origem da API', () => {
    expect(publicPage).toContain('manifest.href = `/public/sites/${site.data.slug}');
    expect(publicPage).not.toContain('${environment.apiUrl}/public/sites');
  });
});

describe('publicação do aplicativo', () => {
  it('valida o checklist no backend antes de publicar', () => {
    expect(service).toContain("code: 'TENANT_PWA_NOT_READY'");
    expect(service).toContain('if (!current.ready)');
    expect(service).toContain("upsertPwaStatus(tenantId, 'PUBLISHED', new Date())");
  });

  it('a página pública só oferece instalação quando publicado', () => {
    expect(service).toContain("findPwaState(tenant.id)).status === 'PUBLISHED'");
    expect(publicPage).toContain('published={site.data.pwaPublished}');
    expect(install).toContain('if (!published || pwa.installed) return null;');
    expect(install).toContain('if (!pwa.available) return null;');
  });
});

describe('UX de instalação', () => {
  it('captura beforeinstallprompt e só chama prompt no clique', () => {
    expect(installHook).toContain("window.addEventListener('beforeinstallprompt', onPrompt)");
    expect(installHook).toContain('event.preventDefault();');
    expect(installHook).toContain('void event.prompt()');
    expect(installHook).toContain("window.addEventListener('appinstalled', onInstalled)");
    // O prompt só é aberto pela ação do visitante.
    expect(install).toContain('onClick={pwa.install}');
  });

  it('mostra instrução do iOS apenas quando não há prompt do Chromium', () => {
    expect(install).toContain('Adicionar à Tela de Início');
    expect(install).toContain('if (pwa.manual)');
    expect(installHook).toContain('const isAppleMobile');
    expect(installHook).toContain('manual: deferred === null && apple');
  });

  it('não mostra nada em modo standalone', () => {
    expect(installHook).toContain("window.matchMedia('(display-mode: standalone)').matches");
    expect(installHook).toContain('installed: installed || standalone');
  });
});

describe('push', () => {
  it('pede permissão somente dentro da ação do usuário', () => {
    expect(pushHook).toContain('const granted = await Notification.requestPermission();');
    expect(pushHook).toContain('navigator.serviceWorker.ready');
    expect(pushHook).toContain('pushManager.subscribe');
    expect(pushHook).toContain('customer/push/subscribe');
    // A chamada vive dentro da mutation, nunca em um efeito de carregamento.
    expect(pushHook).not.toContain('useEffect');
  });

  it('convida a ativar lembretes só quando a permissão ainda é default', () => {
    expect(reminderCta).toContain("if (permission !== 'default') return null;");
  });
});

describe('ícone do push', () => {
  it('o backend envia o APP_ICON 192 do tenant no payload', () => {
    expect(notifications).toContain('app-icon-192.png');
    expect(notifications).toContain('icon: branding.icon');
    expect(notifications).toContain('url: branding.url');
  });

  it('usa o ícone global real como fallback, sem URL quebrada', () => {
    expect(notifications).toContain("FALLBACK_PUSH_ICON = '/icons/agendei-192.png'");
    expect(existsSync(new URL('../../../../web/public/icons/agendei-192.png', import.meta.url))).toBe(
      true,
    );
  });

  it('o service worker usa payload.icon e não conhece o tenant', () => {
    expect(serviceWorker).toContain('data.icon');
    expect(serviceWorker).not.toContain('/icon-192.png');
    expect(serviceWorker).toContain("FALLBACK_ICON = '/icons/agendei-192.png'");
    // O SW não monta URL de tenant: quem sabe o tenant é o backend.
    expect(serviceWorker).not.toContain('app-icon-');
  });

  it('o clique usa a url do payload com fallback seguro', () => {
    expect(serviceWorker).toContain("const target = event.notification.data?.url ?? '/';");
    expect(serviceWorker).toContain('self.clients.openWindow(target)');
  });
});

describe('service worker', () => {
  it('mantém push e notificationclick', () => {
    expect(serviceWorker).toContain("self.addEventListener('push'");
    expect(serviceWorker).toContain("self.addEventListener('notificationclick'");
  });

  it('tem fetch handler para viabilizar a instalação', () => {
    expect(serviceWorker).toContain("self.addEventListener('fetch'");
  });

  it('não cacheia rotas autenticadas', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/tenant/')");
    expect(serviceWorker).toContain("url.pathname.startsWith('/auth/')");
    expect(serviceWorker).toContain("request.headers.has('authorization')");
    expect(serviceWorker).toContain('if (isPrivate(request, url)) return;');
  });

  it('usa network-first para HTML, manifest e branding', () => {
    expect(serviceWorker).toContain("url.pathname.endsWith('.webmanifest')");
    expect(serviceWorker).toContain("request.mode === 'navigate'");
    expect(serviceWorker).toContain('networkFirst(request)');
  });

  it('só usa cache-first em assets versionados', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/assets/')");
    expect(serviceWorker).toContain('cacheFirst(request)');
  });
});
