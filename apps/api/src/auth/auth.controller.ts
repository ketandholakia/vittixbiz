import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema))
    body: z.infer<typeof registerSchema>
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema))
    body: z.infer<typeof loginSchema>
  ) {
    return this.authService.login(body.email, body.password);
  }
}