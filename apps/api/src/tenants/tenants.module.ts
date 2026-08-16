import { Module } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [TenantContextGuard, RolesGuard],
  exports: [TenantContextGuard, RolesGuard],
})
export class TenantsModule {}