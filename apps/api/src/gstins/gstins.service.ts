import { HttpException, Injectable } from '@nestjs/common';
import type { DbTransaction } from '../database/db';
import { gstins } from '../database/schema';
import { GstinValidator } from './gstin-validator';
import type { CreateGstinDto } from './gstins.dto';

export type GstinRow = typeof gstins.$inferSelect;

export interface CreateGstinResult extends GstinRow {
  checksumWarning?: string;
}

/**
 * GSTIN (branch) creation. Takes the tenant-scoped transaction from
 * withTenantTransaction like every other tenant-scoped service method; the
 * insert is also scoped by the caller-supplied organizationId.
 */
@Injectable()
export class GstinsService {
  async create(
    tx: DbTransaction,
    organizationId: string,
    input: CreateGstinDto
  ): Promise<CreateGstinResult> {
    // Normalize to uppercase — GSTINs are canonically uppercase (the PAN and
    // entity/checksum characters are letters). Keeps the validator strict and
    // the stored value canonical regardless of how the client typed it.
    const normalized = input.gstin.trim().toUpperCase();

    const validation = GstinValidator.validate(normalized);
    if (!validation.valid) {
      // Structural failure — the GSTIN cannot be real, reject it as 422 (an
      // input/validation error, not a server bug), matching the e-invoice
      // route's use of 422 for expected, actionable failures.
      throw new HttpException({ message: validation.error }, 422);
    }

    const [row] = await tx
      .insert(gstins)
      .values({
        organizationId,
        gstin: normalized,
        branchName: input.branchName,
        stateCode: normalized.slice(0, 2),
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        pincode: input.pincode ?? null,
      })
      .returning();

    const result: CreateGstinResult = { ...row };
    if (validation.checksumWarning) {
      result.checksumWarning = validation.checksumWarning;
    }
    return result;
  }
}
