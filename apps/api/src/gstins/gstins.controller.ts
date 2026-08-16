import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { RequireRole } from '../tenants/require-role.decorator';
import { RolesGuard } from '../tenants/roles.guard';
import { withTenantTransaction } from '../database/tenant-transaction';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GstinsService } from './gstins.service';
import { createGstinSchema } from './gstins.dto';
import type { CreateGstinDto } from './gstins.dto';

/**
 * GSTIN (branch) creation routes.
 *
 * `GET /organizations/:orgId/gstins` (listing) lives in OrganizationsController
 * and is unaffected by this module — only the POST is added here.
 */
@Controller('organizations/:orgId/gstins')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class GstinsController {
  constructor(private readonly gstinsService: GstinsService) {}

  @Post()
  @RequireRole('admin', 'accountant')
  @UseGuards(RolesGuard)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodValidationPipe(createGstinSchema)) body: CreateGstinDto
  ) {
    return withTenantTransaction(orgId, (tx) =>
      this.gstinsService.create(tx, orgId, body)
    );
  }
}
