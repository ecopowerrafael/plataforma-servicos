import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync('apps/web/src/router.tsx', 'utf8');
const homePageSource = readFileSync('apps/web/src/routes/HomePage.tsx', 'utf8');

describe('WhatsApp app subroutes router registration', () => {
  it('registers direct refresh routes before the catch-all', () => {
    const connectionRoute = routerSource.indexOf("path: '/app/whatsapp/conexao'");
    const messagesRoute = routerSource.indexOf("path: '/app/whatsapp/mensagens'");
    const catchAllRoute = routerSource.indexOf("path: '*'");

    expect(connectionRoute).toBeGreaterThan(-1);
    expect(messagesRoute).toBeGreaterThan(-1);
    expect(connectionRoute).toBeLessThan(catchAllRoute);
    expect(messagesRoute).toBeLessThan(catchAllRoute);
  });

  it('redirects both WhatsApp base paths to the connection subroute', () => {
    expect(homePageSource).toContain('<Navigate to="/app/whatsapp/conexao" replace />');
    expect(routerSource).toContain("path: '/app/whatsapp/'");
    expect(routerSource).toContain('<Navigate replace to="/app/whatsapp/conexao" />');
  });

  it('renders the correct HomePage views for each WhatsApp subroute', () => {
    expect(homePageSource).toContain("isRoute('/app/whatsapp/conexao')");
    expect(homePageSource).toContain('mode="connection"');
    expect(homePageSource).toContain("isRoute('/app/whatsapp/mensagens')");
    expect(homePageSource).toContain('mode="messages"');
  });

  it('keeps menu links pointed to real URLs', () => {
    expect(homePageSource).toContain("to: '/app/whatsapp/conexao'");
    expect(homePageSource).toContain("to: '/app/whatsapp/mensagens'");
    expect(homePageSource).not.toContain('#conexao');
    expect(homePageSource).not.toContain('?whatsapp=');
  });

  it('keeps unknown routes on the NotFound catch-all', () => {
    expect(routerSource).toContain("path: '*'");
    expect(routerSource).toContain('element: lazyPage(NotFoundPage)');
  });
});
