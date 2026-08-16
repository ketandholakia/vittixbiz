'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, customersApi, invoicesApi } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useOrg } from '@/lib/org-context';
import type { Customer, Invoice, InvoiceStatus } from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/input';
import {
  EmptyState,
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
} from '@/components/ui/table';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function InvoicesPage() {
  const { selectedOrg } = useOrg();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    const orgId = selectedOrg.id;
    Promise.all([invoicesApi.list(orgId, status), customersApi.list(orgId)])
      .then(([invoiceRows, customerRows]) => {
        if (!cancelled) {
          setInvoices(invoiceRows);
          setCustomers(customerRows);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Unable to load invoices.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrg, status]);

  function customerName(invoice: Invoice): string {
    if (!customers) return '—';
    return (
      customers.find((c) => c.id === invoice.customerId)?.name ?? '—'
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="GST invoices for the current organization."
        actions={<ButtonLink href="/invoices/new">New invoice</ButtonLink>}
      />

      {error ? <Alert kind="error">{error}</Alert> : null}

      <div className="flex items-center justify-end">
        <div className="w-48">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHead>
            <tr>
              <Th>Invoice number</Th>
              <Th>Customer</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </TableHead>
          {invoices === null ? (
            <EmptyState message="Loading invoices…" />
          ) : invoices.length === 0 ? (
            <EmptyState message="No invoices match this filter." />
          ) : (
            <TableBody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <Td>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </Td>
                  <Td>{customerName(inv)}</Td>
                  <Td>{formatDate(inv.invoiceDate)}</Td>
                  <Td>
                    <StatusBadge status={inv.status} />
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    ₹ {inv.totalAmount}
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>
    </div>
  );
}