import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';

export interface DirectoryCategoryValue {
  publicId: string;
  name: string;
  singularName: string;
  pluralName: string;
  slug: string;
  description: string | null;
  icon: string | null;
  active: boolean;
  indexable: boolean;
  geoapifyCategories: string[] | null;
  externalSearchTerms: string[] | null;
  externalNegativeTerms: string[] | null;
}

const categoryResponse = z.object({ publicId: z.string() }).passthrough();

const commaList = (value: string) =>
  value.trim()
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : null;

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/(^-|-$)/gu, '');

export function DirectoryCategoryForm({
  category,
  onClose,
}: {
  category?: DirectoryCategoryValue;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = category !== undefined;
  const [form, setForm] = useState({
    name: '',
    singularName: '',
    pluralName: '',
    slug: '',
    description: '',
    icon: '',
    active: true,
    indexable: true,
    geoapifyCategories: '',
    externalSearchTerms: '',
    externalNegativeTerms: '',
  });

  useEffect(() => {
    if (category === undefined) return;
    setForm({
      name: category.name,
      singularName: category.singularName,
      pluralName: category.pluralName,
      slug: category.slug,
      description: category.description ?? '',
      icon: category.icon ?? '',
      active: category.active,
      indexable: category.indexable,
      geoapifyCategories: category.geoapifyCategories?.join(', ') ?? '',
      externalSearchTerms: category.externalSearchTerms?.join(', ') ?? '',
      externalNegativeTerms: category.externalNegativeTerms?.join(', ') ?? '',
    });
  }, [category]);

  const save = useMutation({
    mutationFn: () =>
      httpClient.request(
        editing
          ? `/platform/directory/categories/${category.publicId}`
          : '/platform/directory/categories',
        {
          method: editing ? 'PATCH' : 'POST',
          body: editing
            ? {
                name: form.name,
                singularName: form.singularName,
                pluralName: form.pluralName,
                description: form.description || null,
                icon: form.icon || null,
                active: form.active,
                indexable: form.indexable,
                geoapifyCategories: commaList(form.geoapifyCategories),
                externalSearchTerms: commaList(form.externalSearchTerms),
                externalNegativeTerms: commaList(form.externalNegativeTerms),
              }
            : {
                name: form.name,
                singularName: form.singularName,
                pluralName: form.pluralName,
                slug: form.slug,
                ...(form.description ? { description: form.description } : {}),
                ...(form.icon ? { icon: form.icon } : {}),
                active: form.active,
                indexable: form.indexable,
              },
          schema: categoryResponse,
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'directory', 'categories'] });
      onClose();
    },
  });

  const valid =
    form.name.trim().length >= 2 &&
    form.singularName.trim().length >= 2 &&
    form.pluralName.trim().length >= 2 &&
    (editing || form.slug.trim().length >= 2);

  return (
    <>
      <button className="platform-backdrop" type="button" aria-label="Fechar" onClick={onClose} />
      <aside
        className="platform-drawer directory-form-drawer"
        aria-label={editing ? 'Editar categoria' : 'Nova categoria'}
      >
        <button
          type="button"
          className="platform-drawer-close"
          aria-label="Fechar"
          onClick={onClose}
        >
          <IconX size={20} />
        </button>
        <header>
          <span>Diretório</span>
          <h2>{editing ? 'Editar categoria' : 'Nova categoria'}</h2>
          <p>Defina a apresentação, publicação e descoberta externa deste nicho.</p>
        </header>
        <div className="directory-form-grid">
          <label>
            <span>Nome interno</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            <span>Nome singular</span>
            <input
              value={form.singularName}
              onChange={(event) => setForm({ ...form, singularName: event.target.value })}
            />
          </label>
          <label>
            <span>Nome plural</span>
            <input
              value={form.pluralName}
              onChange={(event) =>
                setForm({
                  ...form,
                  pluralName: event.target.value,
                  ...(!editing && !form.slug ? { slug: slugify(event.target.value) } : {}),
                })
              }
            />
          </label>
          <label>
            <span>Slug</span>
            <input
              value={form.slug}
              disabled={editing}
              onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
            />
          </label>
          <label className="directory-form-grid__wide">
            <span>Descrição</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <label>
            <span>Ícone</span>
            <input
              value={form.icon}
              placeholder="Opcional"
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
            />
          </label>
          <label className="directory-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <span>Categoria ativa</span>
          </label>
          <label className="directory-check">
            <input
              type="checkbox"
              checked={form.indexable}
              onChange={(event) => setForm({ ...form, indexable: event.target.checked })}
            />
            <span>Permitir indexação</span>
          </label>
          {editing ? (
            <fieldset className="directory-form-grid__wide">
              <legend>Busca externa</legend>
              <label>
                <span>Categorias Geoapify</span>
                <input
                  value={form.geoapifyCategories}
                  placeholder="commercial, service"
                  onChange={(event) => setForm({ ...form, geoapifyCategories: event.target.value })}
                />
              </label>
              <label>
                <span>Termos de busca</span>
                <input
                  value={form.externalSearchTerms}
                  onChange={(event) =>
                    setForm({ ...form, externalSearchTerms: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Termos excluídos</span>
                <input
                  value={form.externalNegativeTerms}
                  onChange={(event) =>
                    setForm({ ...form, externalNegativeTerms: event.target.value })
                  }
                />
              </label>
            </fieldset>
          ) : null}
        </div>
        {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
        <footer className="directory-form-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="directory-button--primary"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando…' : 'Salvar categoria'}
          </button>
        </footer>
      </aside>
    </>
  );
}
