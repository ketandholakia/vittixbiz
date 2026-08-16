import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TenantContext } from './tenant-context.guard';
import { ROLES_KEY } from './require-role.decorator';

/**
 * Enforces `@RequireRole(...)` on a route by reading the role that
 * {@link TenantContextGuard} attached to the request. Runs AFTER that guard
 * (route-level guards run after controller-level guards in Nest).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { tenant?: TenantContext }>();
    const role = request.tenant?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role for this operation.');
    }
    return true;
  }
}