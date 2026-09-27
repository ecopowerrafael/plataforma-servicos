import { ProfessionalPublicSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';

export function ProfessionalPasswordModal({
  professional,
  tenantPublicId,
  onClose,
}: {
  professional: z.infer<typeof ProfessionalPublicSchema>;
  tenantPublicId: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const changePassword = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${professional.publicId}/password`,
        {
          method: 'PUT',
          body: { password },
          schema: SuccessResponseSchema,
        },
      ),
    onSuccess: () => {
      setPassword('');
      setConfirmation('');
      onClose();
    },
  });

  const isFormValid = password.length >= 8 && password === confirmation;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
      >
        <h2>Alterar senha</h2>
        <p style={{ fontSize: '0.875rem', color: '#666' }}>{professional.name}</p>

        <div style={{ marginTop: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#333' }}>Nova senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              disabled={changePassword.isPending}
              style={{ marginTop: '0.5rem' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#333' }}>
              Confirmar senha
            </span>
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Repita a senha"
              minLength={8}
              disabled={changePassword.isPending}
              style={{ marginTop: '0.5rem' }}
            />
          </label>

          {password && confirmation && password !== confirmation && (
            <p className="form-error">Senhas não conferem.</p>
          )}

          {changePassword.error instanceof Error && (
            <p className="form-error">{changePassword.error.message}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2rem' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={changePassword.isPending}
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => changePassword.mutate()}
            disabled={!isFormValid || changePassword.isPending}
            style={{ flex: 1 }}
          >
            {changePassword.isPending ? 'Alterando…' : 'Alterar'}
          </button>
        </div>
      </section>
    </div>
  );
}
