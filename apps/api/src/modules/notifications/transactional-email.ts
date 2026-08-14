export interface TransactionalEmailDetail {
  label: string;
  value: string;
}

export interface TransactionalEmailInput {
  tenantName: string;
  logoUrl: string | null;
  primaryColor: string;
  title: string;
  intro: string;
  details: TransactionalEmailDetail[];
  afterText: string;
  ctaLabel: string;
  ctaUrl: string;
  protocol?: string | undefined;
}

export const escapeEmailHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const safeHttpUrl = (value: string | null): string | null => {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const safeColor = (value: string): string => (/^#[0-9a-f]{6}$/iu.test(value) ? value : '#2457d6');
const paragraphs = (value: string): string =>
  escapeEmailHtml(value).replaceAll(/\r?\n/gu, '<br>');

export function renderTransactionalEmail(input: TransactionalEmailInput): string {
  const logoUrl = safeHttpUrl(input.logoUrl);
  const ctaUrl = safeHttpUrl(input.ctaUrl);
  const tenantName = escapeEmailHtml(input.tenantName);
  const primary = safeColor(input.primaryColor);
  const brand =
    logoUrl === null
      ? `<div style="font-size:22px;font-weight:700;color:#111827">${tenantName || 'Agendei'}</div>`
      : `<img src="${escapeEmailHtml(logoUrl)}" alt="${tenantName}" style="display:block;max-width:180px;max-height:64px;width:auto;height:auto;border:0">`;
  const details = input.details
    .filter((item) => item.value.trim() !== '')
    .map(
      (item) => `<tr><td style="padding:10px 12px;color:#6b7280;font-size:12px;line-height:18px;width:34%;vertical-align:top">${escapeEmailHtml(item.label)}</td><td style="padding:10px 12px;color:#111827;font-size:14px;font-weight:600;line-height:20px;vertical-align:top">${escapeEmailHtml(item.value)}</td></tr>`,
    )
    .join('');
  const cta =
    ctaUrl === null
      ? ''
      : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0"><tr><td style="border-radius:8px;background:${primary}"><a href="${escapeEmailHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:13px;font-weight:700;line-height:18px;text-decoration:none">${escapeEmailHtml(input.ctaLabel)}</a></td></tr></table>`;
  const protocol =
    input.protocol === undefined || input.protocol.trim() === ''
      ? ''
      : `<p style="margin:20px 0 0;color:#9ca3af;font-size:11px;line-height:17px">Protocolo: ${escapeEmailHtml(input.protocol)}</p>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:${primary}"></td></tr><tr><td style="padding:30px 34px 12px">${brand}</td></tr><tr><td style="padding:16px 34px 34px"><h1 style="margin:0 0 14px;color:#111827;font-size:25px;line-height:32px">${escapeEmailHtml(input.title)}</h1><p style="margin:0 0 22px;color:#4b5563;font-size:15px;line-height:24px">${paragraphs(input.intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:12px;border-collapse:separate;overflow:hidden">${details}</table>${cta}<p style="margin:0;color:#4b5563;font-size:13px;line-height:21px">${paragraphs(input.afterText)}</p>${protocol}</td></tr><tr><td style="padding:20px 34px;background:#f9fafb;color:#6b7280;font-size:11px;line-height:18px">Mensagem enviada por ${tenantName || 'Agendei'} através do Agendei.</td></tr></table></td></tr></table></body></html>`;
}
