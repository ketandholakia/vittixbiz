import { z } from 'zod';
import { Money } from './money';

export const MoneySchema = z.string().transform((val) => new Money(val));

export const OrganizationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const GstinSchema = z.object({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  gstin: z.string().length(15),
  branchName: z.string().min(2).max(100),
});

export const UserSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(2).max(100),
});
