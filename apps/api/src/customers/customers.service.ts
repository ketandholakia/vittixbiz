import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DbTransaction } from '../database/db';
import { customers } from '../database/schema';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
} from './customers.dto';

/**
 * Thin CRUD over the customers table. All methods take the tenant-scoped
 * transaction from `withTenantTransaction`; every query also filters by
 * organizationId so a caller can never touch another tenant's rows even
 * outside of RLS.
 */
@Injectable()
export class CustomersService {
  async create(tx: DbTransaction, organizationId: string, input: CreateCustomerDto) {
    const [row] = await tx
      .insert(customers)
      .values({ ...input, organizationId })
      .returning();
    return row;
  }

  async list(tx: DbTransaction, organizationId: string) {
    return tx
      .select()
      .from(customers)
      .where(eq(customers.organizationId, organizationId));
  }

  async getById(
    tx: DbTransaction,
    organizationId: string,
    id: string
  ) {
    const [row] = await tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, id), eq(customers.organizationId, organizationId))
      );
    return row;
  }

  async update(
    tx: DbTransaction,
    organizationId: string,
    id: string,
    patch: UpdateCustomerDto
  ) {
    const [row] = await tx
      .update(customers)
      .set(patch)
      .where(
        and(eq(customers.id, id), eq(customers.organizationId, organizationId))
      )
      .returning();
    return row;
  }
}