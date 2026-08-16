'use client';

import { use, useEffect, useState } from 'react';
import { ApiError, customersApi, invoicesApi, openInvoicePdf } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { getOrgId } from '@/lib/org';
import type {
  Customer,
  EinvoiceResponse,
  InvoiceDetail,
} from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import {
  EmptyState,
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
} from '@/components/ui/table';

function MoneyRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className={`text-sm ${emphasis ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
        {label}
      </dt>
      <dd
        className={`text-sm tabular-nums ${emphasis ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
      >
        ₹ {value}
      </dd>
    </div>
  );
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [einvoiceResult, setEinvoiceResult] = useState<EinvoiceResponse | null>(null);

  async function load() {
    setError(null);
    // getOrgId() is env-config (NEXT_PUBLIC_ORG_ID) and throws when unset;
    // called here (not during render) so static prerendering stays valid.
    const orgId = getOrgId();
    try {
      const [d, customers] = await Promise.all([
        invoicesApi.get(orgId, id),
        customersApi.list(orgId),
      ]);
      setDetail(d);
      setCustomer(
        customers.find((c) => c.id === d.invoice.customerId) ?? null
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to load the invoice.'
      );
    }
  }

  useEffect(() => {
    load();
    // load() is stable in practice for this page; only the id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleIssue() {
    const orgId = getOrgId();
    setBusy('issue');
    setActionError(null);
    setActionSuccess(null);
    try {
      await invoicesApi.issue(orgId, id);
      setActionSuccess('Invoice issued.');
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Unable to issue the invoice.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleEinvoice() {
    const orgId = getOrgId();
    setBusy('einvoice');
    setActionError(null);
    setActionSuccess(null);
    setEinvoiceResult(null);
    try {
      const result = await invoicesApi.einvoice(orgId, id);
      setEinvoiceResult(result);
      setActionSuccess('E-invoice generated.');
      await load();
    } catch (err) {
      // A 422 here carries the EinvoiceGenerationError message (e.g. invoice
      // not issued, B2C buyer, GSP down) — surface it verbatim, not as a
      // generic error.
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Unable to generate the e-invoice.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    const orgId = getOrgId();
    setBusy('pdf');
    setActionError(null);
    try {
      await openInvoicePdf(orgId, id);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Unable to open the PDF.'
      );
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoice" />
        <Alert kind="error">{error}</Alert>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoice" />
        <p className="text-sm text-slate-500">Loading invoice…</p>
      </div>
    );
  }

  const { invoice, lines } = detail;
  const canIssue = invoice.status === 'draft';
  const canEinvoice = invoice.status === 'issued' && !invoice.irnNumber;

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        description={
          <>
            FY {invoice.financialYear} · <StatusBadge status={invoice.status} />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canIssue ? (
              <Button onClick={handleIssue} disabled={busy !== null}>
                {busy === 'issue' ? 'Issuing…' : 'Issue invoice'}
              </Button>
            ) : null}
            {canEinvoice ? (
              <Button onClick={handleEinvoice} disabled={busy !== null}>
                {busy === 'einvoice' ? 'Generating…' : 'Generate e-invoice'}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handlePdf} disabled={busy !== null}>
              {busy === 'pdf' ? 'Opening…' : 'Download PDF'}
            </Button>
          </div>
        }
      />

      {actionError ? <Alert kind="error">{actionError}</Alert> : null}
      {actionSuccess ? <Alert kind="success">{actionSuccess}</Alert> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <dl>
              <MoneyRow
                label="Customer"
                value={customer?.name ?? invoice.customerId}
                emphasis
              />
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-slate-500">Invoice date</dt>
                <dd className="text-sm tabular-nums text-slate-700">
                  {formatDate(invoice.invoiceDate)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-slate-500">Due date</dt>
                <dd className="text-sm tabular-nums text-slate-700">
                  {formatDate(invoice.dueDate)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <dt className="text-sm text-slate-500">Status</dt>
                <dd>
                  <StatusBadge status={invoice.status} />
                </dd>
              </div>
              {invoice.irnNumber ? (
                <div className="flex items-center justify-between py-1.5">
                  <dt className="text-sm text-slate-500">IRN</dt>
                  <dd className="max-w-[60%] break-all text-right text-sm text-slate-700">
                    {invoice.irnNumber}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Totals" />
          <CardBody>
            <dl>
              <MoneyRow label="Subtotal" value={invoice.subtotal} />
              <MoneyRow label="CGST" value={invoice.totalCgst} />
              <MoneyRow label="SGST" value={invoice.totalSgst} />
              <MoneyRow label="IGST" value={invoice.totalIgst} />
              <MoneyRow label="Cess" value={invoice.totalCess} />
              <MoneyRow label="Total" value={invoice.totalAmount} emphasis />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="E-invoice" />
          <CardBody>
            {invoice.irnNumber ? (
              <p className="text-sm text-slate-600">
                IRN issued on {formatDate(invoice.irnAckDate)}.
              </p>
            ) : einvoiceResult ? (
              <div className="space-y-3">
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={einvoiceResult.qrCodeDataUrl}
                    alt="Invoice QR code"
                    className="h-32 w-32 rounded border border-slate-200"
                  />
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">IRN</dt>
                    <dd className="break-all text-right text-slate-700">
                      {einvoiceResult.irn}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Ack no</dt>
                    <dd className="text-right text-slate-700">
                      {einvoiceResult.ackNo}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {canEinvoice
                  ? 'Generate an e-invoice to receive the IRN and QR code.'
                  : invoice.status === 'issued'
                    ? 'E-invoice already generated.'
                    : 'E-invoicing is available once the invoice is issued.'}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Line items" />
        <Table>
          <TableHead>
            <tr>
              <Th>HSN/SAC</Th>
              <Th>Description</Th>
              <Th>Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Discount</Th>
              <Th className="text-right">Taxable amount</Th>
              <Th className="text-right">Line total</Th>
            </tr>
          </TableHead>
          {lines.length === 0 ? (
            <EmptyState message="No line items." />
          ) : (
            <TableBody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <Td>{line.hsnSacCode}</Td>
                  <Td>{line.description}</Td>
                  <Td className="tabular-nums">
                    {line.quantity}
                    {line.unit ? ` ${line.unit}` : ''}
                  </Td>
                  <Td className="text-right tabular-nums">₹ {line.unitPrice}</Td>
                  <Td className="text-right tabular-nums">₹ {line.discountAmount}</Td>
                  <Td className="text-right tabular-nums">₹ {line.taxableAmount}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    ₹ {line.lineTotal}
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