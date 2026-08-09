import { PlanBenefitResponseSchema } from '@plataforma/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

import type { PlanBenefitPublicSchema } from '@plataforma/shared';

type Benefit = z.infer<typeof PlanBenefitPublicSchema>;

const SuccessSchema = z.object({ success: z.literal(true) });

/**
 * Full CRUD for a plan's public-facing commercial benefits (PlanBenefit).
 * Purely presentational content shown on the /planos marketing page — never
 * wired into limit enforcement, which stays on PlanLimit via PlanLimitsEditor.
 */
export function PlanBenefitsEditor({
  planPublicId,
  benefits,
}: {
  planPublicId: string;
  benefits: Benefit[];
}) {
  const client = useQueryClient();
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () =>
    client.invalidateQueries({ queryKey: ['platform', 'plan', planPublicId] });

  const createMutation = useMutation({
    mutationFn: (text: string) =>
      httpClient.request(`/platform/plans/${planPublicId}/benefits`, {
        method: 'POST',
        body: { text, sortOrder: benefits.length, enabled: true },
        schema: PlanBenefitResponseSchema,
      }),
    onSuccess: async () => {
      setNewText('');
      setActionError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      publicId,
      body,
    }: {
      publicId: string;
      body: { text?: string; sortOrder?: number; enabled?: boolean };
    }) =>
      httpClient.request(`/platform/plan-benefits/${publicId}`, {
        method: 'PATCH',
        body,
        schema: PlanBenefitResponseSchema,
      }),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/plan-benefits/${publicId}`, {
        method: 'DELETE',
        schema: SuccessSchema,
      }),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error ? mutationError.message : 'Não foi possível remover.',
      );
    },
  });

  const ordered = [...benefits].sort((a, b) => a.sortOrder - b.sortOrder);
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const move = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const current = ordered[index];
    const target = ordered[targetIndex];
    if (current === undefined || target === undefined) return;
    void updateMutation.mutateAsync({
      publicId: current.publicId,
      body: { sortOrder: target.sortOrder },
    });
    void updateMutation.mutateAsync({
      publicId: target.publicId,
      body: { sortOrder: current.sortOrder },
    });
  };

  const requestRemoval = (benefit: Benefit) => {
    setConfirmation({
      title: 'Remover benefício?',
      description: `O benefício "${benefit.text}" deixará de aparecer na página pública de planos.`,
      confirmLabel: 'Remover',
      requiresReason: false,
      variant: 'danger',
      onConfirm: async () => {
        await deleteMutation.mutateAsync(benefit.publicId);
      },
    });
  };

  return (
    <fieldset className="platform-form">
      <legend>{'Benefícios comerciais (página pública de planos)'}</legend>
      {ordered.length === 0 ? (
        <p>Nenhum benefício cadastrado.</p>
      ) : (
        <div className="data-list">
          {ordered.map((benefit, index) =>
            editingId === benefit.publicId ? (
              <div className="data-row" key={benefit.publicId}>
                <input
                  onChange={(event) => {
                    setEditingText(event.target.value);
                  }}
                  value={editingText}
                />
                <button
                  disabled={busy || editingText.trim() === ''}
                  onClick={() => {
                    void updateMutation
                      .mutateAsync({
                        publicId: benefit.publicId,
                        body: { text: editingText.trim() },
                      })
                      .then(() => {
                        setEditingId(null);
                      });
                  }}
                  type="button"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    setEditingId(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="data-row" key={benefit.publicId}>
                <span>{benefit.text}</span>
                <span>{benefit.enabled ? 'Ativo' : 'Oculto'}</span>
                <button
                  disabled={busy || index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                  type="button"
                >
                  {'↑ Subir'}
                </button>
                <button
                  disabled={busy || index === ordered.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                  type="button"
                >
                  {'↓ Descer'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditingId(benefit.publicId);
                    setEditingText(benefit.text);
                  }}
                  type="button"
                >
                  Editar
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void updateMutation.mutateAsync({
                      publicId: benefit.publicId,
                      body: { enabled: !benefit.enabled },
                    });
                  }}
                  type="button"
                >
                  {benefit.enabled ? 'Ocultar' : 'Ativar'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    requestRemoval(benefit);
                  }}
                  type="button"
                >
                  Remover
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <label>
        Novo benefício
        <input
          maxLength={160}
          onChange={(event) => {
            setNewText(event.target.value);
          }}
          placeholder="Ex.: Suporte prioritário via WhatsApp"
          value={newText}
        />
      </label>
      <button
        disabled={busy || newText.trim() === ''}
        onClick={() => {
          void createMutation.mutateAsync(newText.trim());
        }}
        type="button"
      >
        Adicionar benefício
      </button>
      {actionError !== null && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </fieldset>
  );
}
