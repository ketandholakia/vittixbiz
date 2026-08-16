'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { createGstin } from '@/lib/org';
import { useOrg } from '@/lib/org-context';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Minimal GSTIN registration form. Full structural validation happens on the
 * backend (GstinValidator). A checksumWarning from the API is shown as a
 * NON-blocking amber notice — the GSTIN is still created.
 */
export default function NewGstinPage() {
  const router = useRouter();
  const { selectedOrg, refreshGstins } = useOrg();

  const [gstin, setGstin] = useState('');
  const [branchName, setBranchName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checksumWarning, setChecksumWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!selectedOrg) {
      setError('Select an organization before adding a GSTIN.');
      return;
    }
    if (!gstin.trim() || !branchName.trim()) {
      setError('GSTIN and branch name are required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createGstin(selectedOrg.id, {
        gstin: gstin.trim(),
        branchName: branchName.trim(),
        addressLine1: addressLine1.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        pincode: pincode.trim() || null,
      });
      // Make the new GSTIN show up in the header/invoice pickers immediately.
      await refreshGstins();

      if (created.checksumWarning) {
        // Non-blocking: the GSTIN WAS created. Pause here so the caller can
        // read the warning before continuing to invoice creation.
        setChecksumWarning(created.checksumWarning);
      } else {
        router.push('/invoices/new');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to add the GSTIN.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setChecksumWarning(null);
    setError(null);
    setGstin('');
    setBranchName('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setPincode('');
  }

  if (!selectedOrg) {
    return (
      <div className="space-y-6">
        <PageHeader title="Add a GSTIN" />
        <Alert kind="error">Select an organization before adding a GSTIN.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add a GSTIN"
        description={`Register a GSTIN for ${selectedOrg.legalName}.`}
      />

      {checksumWarning ? (
        <>
          <Alert kind="warning">{checksumWarning}</Alert>
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push('/invoices/new')}>
              Continue to invoices
            </Button>
            <Button variant="secondary" onClick={resetForm}>
              Add another GSTIN
            </Button>
          </div>
        </>
      ) : (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error ? <Alert kind="error">{error}</Alert> : null}

              <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
                <Field label="GSTIN" htmlFor="gstin" required>
                  <Input
                    id="gstin"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    maxLength={15}
                    placeholder="27AABCU9603R1ZN"
                  />
                </Field>
                <Field label="Branch name" htmlFor="branchName" required>
                  <Input
                    id="branchName"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="Mumbai HQ"
                  />
                </Field>
                <Field label="Address line 1" htmlFor="addressLine1">
                  <Input
                    id="addressLine1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                  />
                </Field>
                <Field label="Address line 2" htmlFor="addressLine2">
                  <Input
                    id="addressLine2"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                  />
                </Field>
                <Field label="City" htmlFor="city">
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </Field>
                <Field label="Pincode" htmlFor="pincode">
                  <Input
                    id="pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    maxLength={6}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push('/invoices')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Adding…' : 'Add GSTIN'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}