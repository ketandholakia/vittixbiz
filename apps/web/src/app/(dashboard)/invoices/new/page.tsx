'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ApiError, customersApi, invoicesApi } from '@/lib/api-client';
import { useOrg } from '@/lib/org-context';
import { todayLocal } from '@/lib/format';
import type { Customer } from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Mirrors createInvoiceSchema in invoices.controller.ts. quantity/unitPrice/
 * discountAmount are sent as strings; the backend parses them into Decimal /
 * Money. The final invoice amounts are always computed by the API — the
 * preview total below is for UX only.
 */
const lineItemSchema = z.object({
  hsnSacCode: z.string().trim().min(1, 'HSN/SAC code is required.'),
  description: z.string().trim().min(1, 'Description is required.'),
  quantity: z.string().trim().min(1, 'Quantity is required.'),
  unitPrice: z.string().trim().min(1, 'Unit price is required.'),
  discountAmount: z.string().trim().optional(),
  unit: z
    .string()
    .trim()
    .max(8, 'Unit must be 8 characters or fewer.')
    .optional(),
});

const invoiceFormSchema = z.object({
  customerId: z.string().min(1, 'Select a customer.'),
  invoiceDate: z.string().min(1, 'Invoice date is required.'),
  dueDate: z.string().optional(),
  notes: z.string().trim().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line item.'),
});

type LineItemValues = z.infer<typeof lineItemSchema>;
type Values = z.infer<typeof invoiceFormSchema>;
type HeaderErrors = Partial<Record<'customerId' | 'invoiceDate', string>>;
type LineErrors = Record<number, Partial<Record<keyof LineItemValues, string>>>;

const emptyLine: LineItemValues = {
  hsnSacCode: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discountAmount: '',
  unit: '',
};

function collectErrors(error: z.ZodError): {
  header: HeaderErrors;
  lineItems: LineErrors;
  linesMessage: string | null;
} {
  const header: HeaderErrors = {};
  const lineItems: LineErrors = {};
  let linesMessage: string | null = null;

  for (const issue of error.issues) {
    const [root, ...rest] = issue.path;
    if (root === 'lineItems' && typeof rest[0] === 'number') {
      const index = rest[0];
      const field = rest[1] as keyof LineItemValues;
      if (!lineItems[index]) lineItems[index] = {};
      if (!lineItems[index][field]) lineItems[index][field] = issue.message;
    } else if (root === 'customerId' || root === 'invoiceDate') {
      if (!header[root]) header[root] = issue.message;
    } else if (root === 'lineItems') {
      linesMessage = issue.message;
    }
  }
  return { header, lineItems, linesMessage };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { selectedOrg, gstins, selectedGstin, selectGstin } = useOrg();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [values, setValues] = useState<Values>({
    customerId: '',
    invoiceDate: todayLocal(),
    dueDate: '',
    notes: '',
    lineItems: [{ ...emptyLine }],
  });
  const [headerErrors, setHeaderErrors] = useState<HeaderErrors>({});
  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [linesMessage, setLinesMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    const orgId = selectedOrg.id;
    customersApi
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setCustomersError(
            err instanceof ApiError ? err.message : 'Unable to load customers.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrg]);

  function updateHeader(
    field: 'customerId' | 'invoiceDate' | 'dueDate' | 'notes',
    value: string
  ) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function updateLine(index: number, field: keyof LineItemValues, value: string) {
    setValues((v) => ({
      ...v,
      lineItems: v.lineItems.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      ),
    }));
  }

  function addLine() {
    setValues((v) => ({ ...v, lineItems: [...v.lineItems, { ...emptyLine }] }));
  }

  function removeLine(index: number) {
    setValues((v) => ({
      ...v,
      lineItems: v.lineItems.filter((_, i) => i !== index),
    }));
  }

  // Preview ONLY. Authoritative totals always come from the API response.
  const previewSubtotal = values.lineItems.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Number(line.discountAmount) || 0;
    return sum + qty * price - discount;
  }, 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = invoiceFormSchema.safeParse(values);
    if (!parsed.success) {
      const { header, lineItems, linesMessage: linesMsg } = collectErrors(parsed.error);
      setHeaderErrors(header);
      setLineErrors(lineItems);
      setLinesMessage(linesMsg);
      return;
    }
    setHeaderErrors({});
    setLineErrors({});
    setLinesMessage(null);

    if (!selectedOrg || !selectedGstin) {
      setFormError('Select an organization and a GSTIN before creating an invoice.');
      setSubmitting(false);
      return;
    }
    setSubmitting(true);

    const input = {
      gstinId: selectedGstin.id,
      customerId: parsed.data.customerId,
      invoiceDate: new Date(`${parsed.data.invoiceDate}T00:00:00`).toISOString(),
      dueDate: parsed.data.dueDate
        ? new Date(`${parsed.data.dueDate}T00:00:00`).toISOString()
        : undefined,
      notes: parsed.data.notes?.trim() || undefined,
      lineItems: parsed.data.lineItems.map((line) => ({
        hsnSacCode: line.hsnSacCode.trim(),
        description: line.description.trim(),
        quantity: line.quantity.trim(),
        unitPrice: line.unitPrice.trim(),
        discountAmount: line.discountAmount?.trim() || '0.00',
        unit: line.unit?.trim() || undefined,
      })),
    };

    try {
      const orgId = selectedOrg.id;
      const created = await invoicesApi.create(orgId, input);
      router.push(`/invoices/${created.invoiceId}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Unable to create the invoice.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New invoice" description="Create a draft invoice." />

      {customersError ? <Alert kind="error">{customersError}</Alert> : null}

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError ? <Alert kind="error">{formError}</Alert> : null}

            {!selectedGstin && gstins.length === 0 ? (
              <Alert kind="error">
                This organization has no GSTIN yet. A GSTIN must be added
                before invoices can be created.
              </Alert>
            ) : gstins.length > 1 ? (
              <Field label="Issuing GSTIN" htmlFor="gstinId">
                <Select
                  id="gstinId"
                  value={selectedGstin?.id ?? ''}
                  onChange={(e) => selectGstin(e.target.value)}
                >
                  {gstins.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.gstin} — {g.branchName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : selectedGstin ? (
              <Field label="Issuing GSTIN">
                <p className="text-sm font-medium text-slate-900">
                  {selectedGstin.gstin} — {selectedGstin.branchName}
                </p>
              </Field>
            ) : null}

            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Field
                label="Customer"
                htmlFor="customerId"
                error={headerErrors.customerId}
                required
              >
                <Select
                  id="customerId"
                  value={values.customerId}
                  onChange={(e) => updateHeader('customerId', e.target.value)}
                >
                  <option value="">Select a customer…</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Invoice date"
                htmlFor="invoiceDate"
                error={headerErrors.invoiceDate}
                required
              >
                <Input
                  id="invoiceDate"
                  type="date"
                  value={values.invoiceDate}
                  onChange={(e) => updateHeader('invoiceDate', e.target.value)}
                />
              </Field>
              <Field label="Due date" htmlFor="dueDate">
                <Input
                  id="dueDate"
                  type="date"
                  value={values.dueDate}
                  onChange={(e) => updateHeader('dueDate', e.target.value)}
                />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  Line items
                </h2>
                <Button type="button" variant="secondary" onClick={addLine}>
                  Add line item
                </Button>
              </div>

              <div className="rounded-md border border-slate-200">
                <div className="grid grid-cols-12 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="col-span-2">HSN/SAC</span>
                  <span className="col-span-3">Description</span>
                  <span className="col-span-1">Qty</span>
                  <span className="col-span-2">Unit price</span>
                  <span className="col-span-2">Discount</span>
                  <span className="col-span-1">Unit</span>
                  <span className="col-span-1" />
                </div>

                {values.lineItems.map((line, index) => {
                  const lineErr = lineErrors[index] ?? {};
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="col-span-2">
                        <Input
                          aria-label={`HSN/SAC code for line ${index + 1}`}
                          value={line.hsnSacCode}
                          onChange={(e) => updateLine(index, 'hsnSacCode', e.target.value)}
                          placeholder="9987"
                        />
                        {lineErr.hsnSacCode ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.hsnSacCode}</p>
                        ) : null}
                      </div>
                      <div className="col-span-3">
                        <Input
                          aria-label={`Description for line ${index + 1}`}
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          placeholder="Consulting services"
                        />
                        {lineErr.description ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.description}</p>
                        ) : null}
                      </div>
                      <div className="col-span-1">
                        <Input
                          aria-label={`Quantity for line ${index + 1}`}
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          placeholder="1"
                        />
                        {lineErr.quantity ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.quantity}</p>
                        ) : null}
                      </div>
                      <div className="col-span-2">
                        <Input
                          aria-label={`Unit price for line ${index + 1}`}
                          value={line.unitPrice}
                          onChange={(e) => updateLine(index, 'unitPrice', e.target.value)}
                          placeholder="1000.00"
                        />
                        {lineErr.unitPrice ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.unitPrice}</p>
                        ) : null}
                      </div>
                      <div className="col-span-2">
                        <Input
                          aria-label={`Discount for line ${index + 1}`}
                          value={line.discountAmount}
                          onChange={(e) => updateLine(index, 'discountAmount', e.target.value)}
                          placeholder="0.00"
                        />
                        {lineErr.discountAmount ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.discountAmount}</p>
                        ) : null}
                      </div>
                      <div className="col-span-1">
                        <Input
                          aria-label={`Unit for line ${index + 1}`}
                          value={line.unit}
                          onChange={(e) => updateLine(index, 'unit', e.target.value)}
                          placeholder="NOS"
                          maxLength={8}
                        />
                        {lineErr.unit ? (
                          <p className="mt-1 text-xs text-red-600">{lineErr.unit}</p>
                        ) : null}
                      </div>
                      <div className="col-span-1 flex items-start justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeLine(index)}
                          disabled={values.lineItems.length === 1}
                          aria-label={`Remove line item ${index + 1}`}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {linesMessage ? (
                  <p className="px-4 py-2 text-sm text-red-600">{linesMessage}</p>
                ) : null}
              </div>

              <div className="mt-4 flex justify-end">
                <p className="text-sm text-slate-500">
                  Subtotal preview (excl. tax):{' '}
                  <span className="font-medium text-slate-900 tabular-nums">
                    ₹ {previewSubtotal.toFixed(2)}
                  </span>
                </p>
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">
                Preview only — the server calculates and returns the final
                amounts when the invoice is created.
              </p>
            </div>

            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                value={values.notes}
                onChange={(e) => updateHeader('notes', e.target.value)}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
              <Button type="button" variant="secondary" onClick={() => router.push('/invoices')}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !selectedGstin}>
                {submitting ? 'Creating…' : 'Create draft invoice'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}