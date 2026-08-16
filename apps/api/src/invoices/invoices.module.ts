import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { InvoicesController } from './invoices.controller';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [InvoicesController],
})
export class InvoicesModule {}