import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  gstin: z.string().length(15).optional().nullable(),
  placeOfSupplyStateCode: z.string().length(2),
  billingAddress: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  pincode: z.string().max(6).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});

/** All fields optional for PATCH updates. */
export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;