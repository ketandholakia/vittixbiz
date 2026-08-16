import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { RequireRole } from '../tenants/require-role.decorator';
import { RolesGuard } from '../tenants/roles.guard';
import { withTenantTransaction } from '../database/tenant-transaction';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GstrExportService } from './gstr-export.service';

const gstr1QuerySchema = z.object({
  financialYear: z.string().regex(/^\d{4}-\d{2}$/),
  month: z.coerce.number().int().min(1).max(12),
});

@Controller('organizations/:orgId/gstins/:gstinId/gstr1')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class GstrExportController {
  @Get()
  @RequireRole('admin', 'accountant')
  @UseGuards(RolesGuard)
  gstr1(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('gstinId', ParseUUIDPipe) gstinId: string,
    @Query(new ZodValidationPipe(gstr1QuerySchema))
    query: z.infer<typeof gstr1QuerySchema>
  ) {
    return withTenantTransaction(orgId, (tx) =>
      GstrExportService.generateGstr1Json(
        tx,
        orgId,
        gstinId,
        query.financialYear,
        query.month
      )
    );
  }
}