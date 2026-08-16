'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ApiError, authApi, setToken } from '@/lib/api-client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

function fieldErrors(
  error: z.ZodError
): Partial<Record<keyof LoginFormValues, string>> {
  const next: Partial<Record<keyof LoginFormValues, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof LoginFormValues;
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState<LoginFormValues>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof LoginFormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const { accessToken } = await authApi.login(values);
      setToken(accessToken);
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      // Surface the API's actual message (e.g. "Invalid credentials")
      // rather than a generic fallback.
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Unable to reach the server. Is the API running?'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your credentials to continue.
          </p>
        </div>

        {formError ? <Alert kind="error">{formError}</Alert> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link
            href="/register"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Register
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}