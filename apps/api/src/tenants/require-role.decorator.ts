import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to specific organization roles, e.g.
 * `@RequireRole('admin', 'accountant')`. The role comes from the tenant
 * context set by {@link TenantContextGuard}, so this decorator must be used
 * alongside that guard.
 */
export const RequireRole = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);