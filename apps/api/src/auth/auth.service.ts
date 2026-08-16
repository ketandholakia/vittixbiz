import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../database/db';
import { users } from '../database/schema';

const BCRYPT_COST = 12;
const TOKEN_EXPIRES_IN = '1h';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterResult {
  id: string;
  email: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Creates a user row. Registration is deliberately decoupled from
   * organization creation — the caller is expected to set up tenants
   * separately (see Phase 5 notes; test data is seeded directly for now).
   * Never returns the password hash.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const [user] = await db
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          fullName: input.fullName,
        })
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
        });
      return user;
    } catch (error) {
      // Unique violation on users.email (Postgres code 23505).
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  /**
   * Verifies credentials and returns a signed JWT. Both a wrong email and a
   * wrong password produce the same generic error so neither can be probed.
   */
  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    const valid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const accessToken = this.jwtService.sign({ sub: user.id });
    return { accessToken };
  }
}