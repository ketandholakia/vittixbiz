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

const registerFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

function fieldErrors(
  error: z.ZodError
): Partial<Record<keyof RegisterFormValues, string>> {
  const next: Partial<Record<keyof RegisterFormValues, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof RegisterFormValues;
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

export default function RegisterPage() {
  const router = useRouter();
  const [values, setValues] = useState<RegisterFormValues>({
    fullName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof RegisterFormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      // Register creates the user only (no token). Sign in immediately so the
      // user lands on /dashboard as the task specifies.
      await authApi.register(values);
      const { accessToken } = await authApi.login({
        email: values.email,
        password: values.password,
      });
      setToken(accessToken);
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      // Show the API's real reason (e.g. 409 "A user with this email already
      // exists.").
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
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registration currently creates a user; org membership is provisioned
            outside the app.
          </p>
        </div>

        {formError ? <Alert kind="error">{formError}</Alert> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
            <Input
              id="fullName"
              autoComplete="name"
              value={values.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              placeholder="Priya Sharma"
            />
          </Field>
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
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password}
            hint="At least 8 characters."
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}