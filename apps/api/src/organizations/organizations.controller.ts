import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { withTenantTransaction } from '../database/tenant-transaction';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrganizationsService } from './organizations.service';
import { createOrganizationSchema } from './organizations.dto';
import type { CreateOrganizationDto } from './organizations.dto';

/**
 * Org-scoped organization routes.
 *
 * `POST /organizations` is guarded by JwtAuthGuard ONLY (not
 * TenantContextGuard): creating an organization is how a user gets their first
 * tenant, so it cannot require an existing tenant context.
 */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrganizationSchema))
    body: CreateOrganizationDto
  ) {
    return this.organizationsService.create(body, user.userId);
  }

  @Get(':orgId/gstins')
  @UseGuards(JwtAuthGuard, TenantContextGuard)
  listGstins(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return withTenantTransaction(orgId, (tx) =>
      this.organizationsService.listGstins(tx, orgId)
    );
  }
}