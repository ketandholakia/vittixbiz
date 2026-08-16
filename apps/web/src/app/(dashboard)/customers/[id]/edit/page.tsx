'use client';

import { use, useEffect, useState } from 'react';
import { ApiError, customersApi } from '@/lib/api-client';
import { getOrgId } from '@/lib/org';
import type { Customer } from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { Card, CardBody } from '@/components/ui/card';
import { CustomerForm } from '@/components/customers/customer-form';
import { PageHeader } from '@/components/ui/page-header';

export default function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    customersApi
      .get(getOrgId(), id)
      .then((c) => {
        if (!cancelled) setCustomer(c);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Unable to load the customer.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <PageHeader title="Edit customer" description="Update buyer details." />

      {error ? <Alert kind="error">{error}</Alert> : null}

      {customer ? (
        <Card>
          <CardBody>
            <CustomerForm key={customer.id} customer={customer} />
          </CardBody>
        </Card>
      ) : error ? null : (
        <p className="text-sm text-slate-500">Loading customer…</p>
      )}
    </div>
  );
}