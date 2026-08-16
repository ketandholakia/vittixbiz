import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { OrganizationsController } from './organizations.controller';
import { MyOrganizationsController } from './my-organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [OrganizationsController, MyOrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}