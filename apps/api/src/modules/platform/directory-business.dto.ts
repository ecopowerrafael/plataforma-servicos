import { z } from 'zod';

export const CreateDirectoryBusinessInput = z.object({
  categoryPublicId: z.string().uuid(),
  name: z.string().min(1).max(180),
  rawAddress: z.string().min(1),
  street: z.string().max(180).optional(),
  number: z.string().max(32).optional(),
  complement: z.string().max(160).optional(),
  neighborhood: z.string().max(120).optional(),
  city: z.string().min(1).max(120),
  state: z.string().length(2).toUpperCase(),
  postalCode: z.string().length(8).optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  active: z.boolean().default(true),
  indexable: z.boolean().default(true),
});

export const UpdateDirectoryBusinessInput = z.object({
  name: z.string().min(1).max(180).optional(),
  rawAddress: z.string().min(1).optional(),
  street: z.string().max(180).optional().nullable(),
  number: z.string().max(32).optional().nullable(),
  complement: z.string().max(160).optional().nullable(),
  neighborhood: z.string().max(120).optional().nullable(),
  city: z.string().min(1).max(120).optional(),
  state: z.string().length(2).toUpperCase().optional(),
  postalCode: z.string().length(8).optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  websiteUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
  indexable: z.boolean().optional(),
});

export const DirectoryBusinessResponse = z.object({
  publicId: z.string(),
  categoryId: z.string(),
  name: z.string(),
  slug: z.string(),
  citySlug: z.string(),
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
  seoQualityScore: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateDirectoryBusinessInput = z.infer<typeof CreateDirectoryBusinessInput>;
export type UpdateDirectoryBusinessInput = z.infer<typeof UpdateDirectoryBusinessInput>;
export type DirectoryBusinessResponse = z.infer<typeof DirectoryBusinessResponse>;
