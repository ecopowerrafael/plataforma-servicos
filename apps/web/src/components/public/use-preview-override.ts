import { TenantBrandingSchema, TenantPublicLayoutSchema, TenantPublicThemeSchema } from '@plataforma/shared';
import { useEffect, useState } from 'react';
import { z } from 'zod';

/**
 * Mensagem aceita do Brand Studio. Só cores, tema e modelo — nenhum HTML,
 * nenhum campo livre. O que não casar com este schema é descartado.
 */
export const PreviewOverrideMessageSchema = z
  .object({
    type: z.literal('agendei:preview'),
    theme: TenantPublicThemeSchema.optional(),
    layout: TenantPublicLayoutSchema.optional(),
    branding: TenantBrandingSchema.partial()
      .pick({
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        backgroundColor: true,
        surfaceColor: true,
        textColor: true,
        mutedTextColor: true,
        borderColor: true,
        onPrimaryColor: true,
        headerColor: true,
        headerTextColor: true,
        navigationColor: true,
        activeColor: true,
      })
      .optional(),
  })
  .strict();

type Message = z.infer<typeof PreviewOverrideMessageSchema>;
/** Somente cores, tema e modelo; cada campo ausente mantém o persistido. */
export type PreviewOverride = Omit<Message, 'type'>;

export const PREVIEW_MESSAGE_TYPE = 'agendei:preview';

/** Só vale dentro do iframe do Brand Studio, com `?preview=1`. */
export function isPreviewEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get('preview') === '1' && window.parent !== window
  );
}

/**
 * Aplica, apenas em memória, os valores que o Brand Studio está editando.
 * Nada é persistido: recarregar a página volta ao que está salvo. Fora do
 * iframe de preview, as mensagens são ignoradas.
 */
export function usePreviewOverride(): PreviewOverride | null {
  const [override, setOverride] = useState<PreviewOverride | null>(null);

  useEffect(() => {
    if (!isPreviewEmbedded()) return undefined;
    const onMessage = (event: MessageEvent) => {
      // Mesma origem apenas: nada externo altera a página.
      if (event.origin !== window.location.origin) return;
      const parsed = PreviewOverrideMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      setOverride({
        ...(parsed.data.theme === undefined ? {} : { theme: parsed.data.theme }),
        ...(parsed.data.layout === undefined ? {} : { layout: parsed.data.layout }),
        ...(parsed.data.branding === undefined ? {} : { branding: parsed.data.branding }),
      });
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return override;
}
