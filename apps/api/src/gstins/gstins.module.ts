import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { GstinsController } from './gstins.controller';
import { GstinsService } from './gstins.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [GstinsController],
  providers: [GstinsService],
})
export class GstinsModule {}
