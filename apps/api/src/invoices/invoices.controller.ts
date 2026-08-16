import { Money } from '@vittixbiz/shared-types';
import Decimal from 'decimal.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { RequireRole } from '../tenants/require-role.decorator';
import { RolesGuard } from '../tenants/roles.guard';
import { withTenantTransaction } from '../database/tenant-transaction';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  EinvoiceGenerationError,
  EinvoiceService,
} from '../gstn-integration/einvoice.service';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';

const createInvoiceSchema = z.object({
  gstinId: z.string().uuid(),
  customerId: z.string().uuid(),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        hsnSacCode: z.string().min(1),
        description: z.string().min(1),
        quantity: z.string(),
        unitPrice: z.string(),
        discountAmount: z.string().optional().default('0.00'),
        unit: z.string().max(8).optional(),
      })
    )
    .min(1),
});

const listInvoicesSchema = z.object({
  status: z
    .enum(['draft', 'issued', 'paid', 'partially_paid', 'cancelled'])
    .optional(),
});

@Controller('organizations/:orgId/invoices')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class InvoicesController {
  private readonly einvoiceService = new EinvoiceService();

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema))
    body: z.infer<typeof createInvoiceSchema>
  ) {
    return withTenantTransaction(orgId, (tx) =>
      InvoicesService.createInvoice(tx, {
        organizationId: orgId,
        gstinId: body.gstinId,
        customerId: body.customerId,
        invoiceDate: new Date(body.invoiceDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        notes: body.notes,
        lineItems: body.lineItems.map((line) => ({
          hsnSacCode: line.hsnSacCode,
          description: line.description,
          quantity: new Decimal(line.quantity),
          unitPrice: new Money(line.unitPrice),
          discountAmount: new Money(line.discountAmount),
          unit: line.unit,
        })),
      })
    );
  }

  @Post(':id/issue')
  @RequireRole('admin', 'accountant')
  @UseGuards(RolesGuard)
  issue(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return withTenantTransaction(orgId, (tx) =>
      InvoicesService.issueInvoice(tx, id)
    );
  }

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query(new ZodValidationPipe(listInvoicesSchema))
    query: z.infer<typeof listInvoicesSchema>
  ) {
    return withTenantTransaction(orgId, (tx) =>
      InvoicesService.listInvoices(tx, orgId, query.status)
    );
  }

  @Get(':id')
  getOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return withTenantTransaction(orgId, async (tx) => {
      const row = await InvoicesService.getInvoiceWithLines(tx, orgId, id);
      if (!row) {
        throw new NotFoundException('Invoice not found.');
      }
      return row;
    });
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Buffer> {
    // InvoicePdfService renders from the global db (read-only) and does not
    // itself check org membership, so verify ownership inside a tenant
    // transaction before rendering.
    await withTenantTransaction(orgId, async (tx) => {
      const row = await InvoicesService.getInvoiceWithLines(tx, orgId, id);
      if (!row) {
        throw new NotFoundException('Invoice not found.');
      }
    });
    return InvoicePdfService.generateInvoicePdf(id);
  }

  @Post(':id/einvoice')
  @RequireRole('admin', 'accountant')
  @UseGuards(RolesGuard)
  async einvoice(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    try {
      return await withTenantTransaction(orgId, (tx) =>
        this.einvoiceService.generateEinvoiceForInvoice(tx, id)
      );
    } catch (error) {
      // Expected, actionable failure (draft invoice, B2C, missing IRN data,
      // GSP down) — report as 422, not a 500 server bug.
      if (error instanceof EinvoiceGenerationError) {
        throw new HttpException({ message: error.message }, 422);
      }
      throw error;
    }
  }
}