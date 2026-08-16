import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './require-role.decorator';

function makeContext(role: string | undefined) {
  const request = { tenant: role ? { organizationId: 'org-1', role } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function makeReflector(requiredRoles: string[] | undefined) {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as any;
}

describe('RolesGuard', () => {
  it('allows when the required role matches the tenant role', () => {
    const reflector = makeReflector(['admin', 'accountant']);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext('accountant'))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.any(Object),
      expect.any(Object),
    ]);
  });

  it('denies when the tenant role is not in the required list', () => {
    const reflector = makeReflector(['admin', 'accountant']);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext('viewer'))).toThrow(
      ForbiddenException
    );
  });

  it('allows routes with no role requirement', () => {
    const reflector = makeReflector(undefined);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('denies when there is no tenant context at all', () => {
    const reflector = makeReflector(['admin']);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException
    );
  });
});