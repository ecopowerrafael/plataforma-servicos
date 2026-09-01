import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';

interface DirectoryBusinessFormProps {
  businessPublicId?: string;
  onClose: () => void;
}

export function DirectoryBusinessForm({ businessPublicId, onClose }: DirectoryBusinessFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!businessPublicId;

  const [form, setForm] = useState({
    categoryPublicId: '',
    name: '',
    rawAddress: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    whatsapp: '',
    websiteUrl: '',
    active: true,
    indexable: false,
  });

  const [error, setError] = useState<string>('');

  const categories = useQuery({
    queryKey: ['platform', 'directory', 'categories'],
    queryFn: () =>
      httpClient.request('/platform/directory/admin/categories', {
        schema: z.array(z.object({ publicId: z.string(), pluralName: z.string() })),
      }),
  });

  const businessDetail = useQuery({
    enabled: isEdit && !!businessPublicId,
    queryKey: ['platform', 'directory', 'business', businessPublicId],
    queryFn: () =>
      httpClient.request(`/platform/directory/businesses/${businessPublicId}`, {
        schema: z.object({
          publicId: z.string(),
          categoryId: z.string(),
          name: z.string(),
          rawAddress: z.string(),
          street: z.string().nullable(),
          number: z.string().nullable(),
          complement: z.string().nullable(),
          neighborhood: z.string().nullable(),
          city: z.string(),
          state: z.string(),
          postalCode: z.string().nullable(),
          phone: z.string().nullable(),
          whatsapp: z.string().nullable(),
          websiteUrl: z.string().nullable(),
          active: z.boolean(),
          indexable: z.boolean(),
        }),
      }),
  });

  // Load form when detail fetched
  useEffect(() => {
    if (!isEdit || !businessDetail.data) return;

    const data = businessDetail.data;
    setForm({
      categoryPublicId: data.categoryId,
      name: data.name,
      rawAddress: data.rawAddress,
      street: data.street || '',
      number: data.number || '',
      complement: data.complement || '',
      neighborhood: data.neighborhood || '',
      city: data.city,
      state: data.state,
      postalCode: data.postalCode || '',
      phone: data.phone || '',
      whatsapp: data.whatsapp || '',
      websiteUrl: data.websiteUrl || '',
      active: data.active,
      indexable: data.indexable,
    });
  }, [isEdit, businessPublicId, businessDetail.data]);

  const createMutation = useMutation({
    mutationFn: (input: any) =>
      httpClient.request('/platform/directory/businesses', {
        method: 'POST',
        body: input,
        schema: z.object({ publicId: z.string() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'businesses'] });
      onClose();
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code || 'UNKNOWN_ERROR';
      const msg =
        code === 'DIRECTORY_BUSINESS_ALREADY_EXISTS'
          ? 'Estabelecimento já existe nesta categoria e cidade.'
          : code === 'INVALID_PHONE'
            ? 'Número de telefone inválido.'
            : code === 'INVALID_WHATSAPP'
              ? 'Número de WhatsApp inválido.'
              : code === 'DIRECTORY_CATEGORY_NOT_FOUND'
                ? 'Categoria não encontrada.'
                : 'Erro ao criar estabelecimento.';
      setError(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: any) =>
      httpClient.request(`/platform/directory/businesses/${businessPublicId}/details`, {
        method: 'PATCH',
        body: input,
        schema: z.object({ publicId: z.string() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'businesses'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'business', businessPublicId] });
      onClose();
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code || 'UNKNOWN_ERROR';
      const msg =
        code === 'DIRECTORY_BUSINESS_ALREADY_EXISTS'
          ? 'Outro estabelecimento com esse nome já existe nesta categoria.'
          : code === 'INVALID_PHONE'
            ? 'Número de telefone inválido.'
            : code === 'INVALID_WHATSAPP'
              ? 'Número de WhatsApp inválido.'
              : code === 'DIRECTORY_BUSINESS_NOT_FOUND'
                ? 'Estabelecimento não encontrado.'
                : 'Erro ao atualizar estabelecimento.';
      setError(msg);
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Validation helpers
  const isCategoryValid = form.categoryPublicId.trim().length > 0;
  const isNameValid = form.name.trim().length > 0;
  const isAddressValid = form.rawAddress.trim().length > 0;
  const isCityValid = form.city.trim().length > 0;
  const isStateValid = form.state.trim().length === 2;

  const isCreateValid = isCategoryValid && isNameValid && isAddressValid && isCityValid && isStateValid;
  const isEditValid = isNameValid && isAddressValid && isCityValid && isStateValid;
  const isFormValid = isEdit ? isEditValid : isCreateValid;

  const handleSubmit = () => {
    setError('');

    if (!isFormValid) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    const normalizeCep = (cep: string) => cep.replace(/\D/g, '');

    const payload = isEdit
      ? {
          name: form.name,
          rawAddress: form.rawAddress,
          street: form.street || null,
          number: form.number || null,
          complement: form.complement || null,
          neighborhood: form.neighborhood || null,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode ? normalizeCep(form.postalCode) : null,
          phone: form.phone || null,
          whatsapp: form.whatsapp || null,
          websiteUrl: form.websiteUrl || null,
          active: form.active,
          indexable: form.indexable,
        }
      : {
          categoryPublicId: form.categoryPublicId,
          name: form.name,
          rawAddress: form.rawAddress,
          street: form.street || undefined,
          number: form.number || undefined,
          complement: form.complement || undefined,
          neighborhood: form.neighborhood || undefined,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode ? normalizeCep(form.postalCode) : undefined,
          phone: form.phone || undefined,
          whatsapp: form.whatsapp || undefined,
          websiteUrl: form.websiteUrl || undefined,
          active: form.active,
          indexable: form.indexable,
        };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--ds-background-primary)', borderRadius: '8px', padding: '2rem', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{isEdit ? 'Editar' : 'Adicionar'} Estabelecimento</h2>

        {error && <div style={{ color: 'var(--ds-text-negative)', marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--ds-background-negative-subtle)', borderRadius: '4px' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isEdit && (
            <>
              <label>
                Categoria * {!isCategoryValid && <span style={{ color: 'var(--ds-text-negative)' }}>obrigatória</span>}
                <select value={form.categoryPublicId} onChange={(e) => setForm({ ...form, categoryPublicId: e.target.value })} disabled={isEdit} style={{ width: '100%', padding: '0.5rem' }}>
                  <option value="">Selecione</option>
                  {categories.data?.map((cat) => (
                    <option key={cat.publicId} value={cat.publicId}>
                      {cat.pluralName}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            Nome * {!isNameValid && <span style={{ color: 'var(--ds-text-negative)' }}>obrigatório</span>}
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do estabelecimento" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <label>
            Endereço Completo * {!isAddressValid && <span style={{ color: 'var(--ds-text-negative)' }}>obrigatório</span>}
            <input type="text" value={form.rawAddress} onChange={(e) => setForm({ ...form, rawAddress: e.target.value })} placeholder="Rua, número, complemento" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label>
              Rua
              <input type="text" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
            </label>
            <label>
              Número
              <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
            </label>
          </div>

          <label>
            Complemento
            <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <label>
            Bairro
            <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
            <label>
              Cidade * {!isCityValid && <span style={{ color: 'var(--ds-text-negative)' }}>obrigatória</span>}
              <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
            </label>
            <label>
              Estado * {!isStateValid && <span style={{ color: 'var(--ds-text-negative)' }}>2 chars</span>}
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
            </label>
          </div>

          <label>
            CEP
            <input type="text" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="12345-678" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <label>
            WhatsApp
            <input type="text" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(85) 98877-6655" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <label>
            Telefone
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(85) 3082-1234" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <label>
            Website
            <input type="url" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://exemplo.com" style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={form.indexable} onChange={(e) => setForm({ ...form, indexable: e.target.checked })} /> Indexável
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button onClick={onClose} disabled={isLoading} style={{ flex: 1, padding: '0.75rem' }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={isLoading || !isFormValid || (isEdit && businessDetail.isLoading)} style={{ flex: 1, padding: '0.75rem', backgroundColor: isFormValid ? 'var(--ds-background-positive-subtle)' : 'var(--ds-background-tertiary)', cursor: isFormValid ? 'pointer' : 'not-allowed' }}>
              {isLoading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
