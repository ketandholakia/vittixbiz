import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { OrganizationsService } from './organizations.service';

/**
 * Membership discovery — how the frontend finds which organizations a user
 * can scope to.
 *
 * Guarded by JwtAuthGuard ONLY (NOT TenantContextGuard): it would be circular
 * to require an existing org context in order to discover the org context.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MyOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('organizations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listForUser(user.userId);
  }
}