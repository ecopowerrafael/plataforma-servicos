import { z } from 'zod';

/**
 * Shared schema for image URLs across tenant (admin) and public endpoints.
 * Accepts both formats:
 * - /tenant/(services|combos|professionals)/{uuid}/image
 * - /public/(services|combos|professionals)/{uuid}/image?variant=thumbnail
 */
export const ImageUrlSchema = z
  .string()
  .regex(/^(\/(tenant|public)\/(services|combos|professionals)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/image)(\?.*)?$/iu)
  .nullable();
