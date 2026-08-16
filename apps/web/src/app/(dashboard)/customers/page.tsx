'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, customersApi } from '@/lib/api-client';
import { useOrg } from '@/lib/org-context';
import type { Customer } from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  EmptyState,
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
} from '@/components/ui/table';

export default function CustomersPage() {
  const { selectedOrg } = useOrg();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    customersApi
      .list(selectedOrg.id)
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Unable to load customers.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrg]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="The buyers you invoice against."
        actions={<ButtonLink href="/customers/new">New customer</ButtonLink>}
      />

      {error ? <Alert kind="error">{error}</Alert> : null}

      <Card>
        <Table>
          <TableHead>
            <tr>
              <Th>Name</Th>
              <Th>GSTIN</Th>
              <Th>State</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>City</Th>
            </tr>
          </TableHead>
          {customers === null ? (
            <EmptyState message="Loading customers…" />
          ) : customers.length === 0 ? (
            <EmptyState message="No customers yet. Create your first one." />
          ) : (
            <TableBody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link
                      href={`/customers/${c.id}/edit`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {c.name}
                    </Link>
                  </Td>
                  <Td>{c.gstin ?? '—'}</Td>
                  <Td>{c.placeOfSupplyStateCode}</Td>
                  <Td>{c.email ?? '—'}</Td>
                  <Td>{c.phone ?? '—'}</Td>
                  <Td>{[c.city, c.pincode].filter(Boolean).join(', ') || '—'}</Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>
    </div>
  );
}