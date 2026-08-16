import { z } from 'zod';

/**
 * GSTIN creation body. The gstin itself is validated at the service layer via
 * GstinValidator (structural rules + soft checksum warning); the Zod schema
 * here only enforces that required fields are present.
 */
export const createGstinSchema = z.object({
  gstin: z.string().min(1),
  branchName: z.string().min(1),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
});

export type CreateGstinDto = z.infer<typeof createGstinSchema>;
