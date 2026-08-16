'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { createOrganization } from '@/lib/org';
import { useOrg } from '@/lib/org-context';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * Minimal org creation page. Only legalName is collected — the other
 * createOrganizationSchema fields (tradeName, panNumber, defaultCurrency,
 * fiscalYearStartMonth) all have defaults on the backend. GSTINs are added
 * separately afterwards via /gstins/new, so they are not offered here.
 */
export default function NewOrganizationPage() {
  const router = useRouter();
  const { refreshOrgs } = useOrg();
  const [legalName, setLegalName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const name = legalName.trim();
    if (!name) {
      setError('Organization name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await createOrganization({ legalName: name });
      // Re-fetch the membership list so the provider picks up the new org
      // before navigating back to the dashboard.
      await refreshOrgs();
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to create the organization.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardBody className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Create your organization
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              You don&apos;t belong to any organization yet. Create one to get
              started.
            </p>
          </div>

          {error ? <Alert kind="error">{error}</Alert> : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Organization name" htmlFor="legalName" required>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Acme Traders Pvt. Ltd."
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Creating…' : 'Create organization'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}