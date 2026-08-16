import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from './jwt.strategy';

/**
 * Extracts the authenticated user (populated by the JWT strategy) from the
 * request. Use on routes guarded by {@link JwtAuthGuard}, e.g.
 * `@CurrentUser() user: AuthenticatedUser`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    return request.user ?? { userId: '' };
  }
);