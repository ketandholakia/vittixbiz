import { z } from 'zod';

/**
 * Org creation body. GSTIN creation is deliberately NOT part of this schema —
 * it requires GSTIN format validation and state-code derivation, which is a
 * separate, larger piece of work (flagged as a follow-up; not built here).
 */
export const createOrganizationSchema = z.object({
  legalName: z.string().min(1),
  tradeName: z.string().optional().nullable(),
  panNumber: z.string().length(10).optional().nullable(),
  defaultCurrency: z.string().length(3).default('INR'),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(4),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;