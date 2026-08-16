'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ApiError, customersApi } from '@/lib/api-client';
import { getOrgId } from '@/lib/org';
import type { CreateCustomerInput, Customer } from '@/lib/api-types';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';

/**
 * Mirrors the backend createCustomerSchema (customers.dto.ts): name is
 * required, gstin must be exactly 15 chars when present, placeOfSupplyStateCode
 * exactly 2 chars, and the rest are optional. Empty optional inputs are sent
 * as null (the backend columns are nullable).
 */
const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  gstin: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .length(15, 'GSTIN must be exactly 15 characters.'),
    ])
    .optional(),
  placeOfSupplyStateCode: z
    .string()
    .trim()
    .length(2, 'State code must be exactly 2 characters.'),
  billingAddress: z.string().trim().optional(),
  shippingAddress: z.string().trim().optional(),
  city: z
    .string()
    .trim()
    .max(100, 'City must be 100 characters or fewer.')
    .optional(),
  pincode: z
    .string()
    .trim()
    .max(6, 'PIN code must be 6 characters or fewer.')
    .optional(),
  email: z.union([z.literal(''), z.email('Enter a valid email address.')]).optional(),
  phone: z
    .string()
    .trim()
    .max(20, 'Phone must be 20 characters or fewer.')
    .optional(),
});

type Values = z.infer<typeof schema>;

function fieldErrors(
  error: z.ZodError
): Partial<Record<keyof Values, string>> {
  const next: Partial<Record<keyof Values, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof Values;
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

function toCreateInput(values: Values): CreateCustomerInput {
  return {
    name: values.name,
    placeOfSupplyStateCode: values.placeOfSupplyStateCode,
    gstin: values.gstin?.trim() || null,
    billingAddress: values.billingAddress?.trim() || null,
    shippingAddress: values.shippingAddress?.trim() || null,
    city: values.city?.trim() || null,
    pincode: values.pincode?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
  };
}

export function CustomerForm({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const isEdit = Boolean(customer);

  const [values, setValues] = useState<Values>(() => ({
    name: customer?.name ?? '',
    gstin: customer?.gstin ?? '',
    placeOfSupplyStateCode: customer?.placeOfSupplyStateCode ?? '',
    billingAddress: customer?.billingAddress ?? '',
    shippingAddress: customer?.shippingAddress ?? '',
    city: customer?.city ?? '',
    pincode: customer?.pincode ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof Values, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);

    const input = toCreateInput(parsed.data);
    try {
      // getOrgId() is env-config (NEXT_PUBLIC_ORG_ID) and throws when unset;
      // called here (not during render) so static prerendering stays valid.
      const orgId = getOrgId();
      if (isEdit && customer) {
        await customersApi.update(orgId, customer.id, input);
      } else {
        await customersApi.create(orgId, input);
      }
      router.push('/customers');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Unable to save the customer.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError ? <Alert kind="error">{formError}</Alert> : null}

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Acme Traders Pvt. Ltd."
          />
        </Field>
        <Field
          label="GSTIN"
          htmlFor="gstin"
          error={errors.gstin}
          hint="Leave blank for B2C buyers."
        >
          <Input
            id="gstin"
            value={values.gstin}
            onChange={(e) => update('gstin', e.target.value)}
            placeholder="27AAACA1234A1Z5"
            maxLength={15}
          />
        </Field>
        <Field
          label="Place of supply state code"
          htmlFor="placeOfSupplyStateCode"
          error={errors.placeOfSupplyStateCode}
          hint="2-digit state code, e.g. 27 for Maharashtra."
          required
        >
          <Input
            id="placeOfSupplyStateCode"
            value={values.placeOfSupplyStateCode}
            onChange={(e) => update('placeOfSupplyStateCode', e.target.value)}
            placeholder="27"
            maxLength={2}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="billing@acme.com"
          />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone}>
          <Input
            id="phone"
            value={values.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city}>
          <Input
            id="city"
            value={values.city}
            onChange={(e) => update('city', e.target.value)}
          />
        </Field>
        <Field label="PIN code" htmlFor="pincode" error={errors.pincode}>
          <Input
            id="pincode"
            value={values.pincode}
            onChange={(e) => update('pincode', e.target.value)}
            maxLength={6}
          />
        </Field>
      </div>

      <Field label="Billing address" htmlFor="billingAddress" error={errors.billingAddress}>
        <Textarea
          id="billingAddress"
          value={values.billingAddress}
          onChange={(e) => update('billingAddress', e.target.value)}
        />
      </Field>
      <Field label="Shipping address" htmlFor="shippingAddress" error={errors.shippingAddress}>
        <Textarea
          id="shippingAddress"
          value={values.shippingAddress}
          onChange={(e) => update('shippingAddress', e.target.value)}
        />
      </Field>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.push('/customers')}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Creating…'
            : isEdit
              ? 'Save changes'
              : 'Create customer'}
        </Button>
      </div>
    </form>
  );
}