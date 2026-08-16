import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { GstrExportController } from './gstr-export.controller';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [GstrExportController],
})
export class GstnIntegrationModule {}