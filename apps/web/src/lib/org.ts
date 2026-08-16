/**
 * Organization (tenant) id for all /organizations/:orgId/... calls.
 *
 * KNOWN GAP: the API has no "list my organizations" endpoint yet, so there is
 * no way to look the user's membership up from the client. Until that exists,
 * the org id is read from NEXT_PUBLIC_ORG_ID (env var, inlined at build time).
 * Replace `getOrgId` with a real selector backed by a membership endpoint
 * before treating this as production-ready.
 */
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? '';

export function getOrgId(): string {
  if (!ORG_ID) {
    throw new Error(
      'NEXT_PUBLIC_ORG_ID is not set. Set it in apps/web/.env.local (see .env.example).'
    );
  }
  return ORG_ID;
}

/**
 * Issuing GSTIN id required by POST /organizations/:orgId/invoices.
 *
 * KNOWN GAP: the API has no list-GSTINs endpoint yet either, so the first
 * GSTIN of the org is taken from NEXT_PUBLIC_GSTIN_ID. Replace with a real
 * branch selector once the backend exposes org GSTINs.
 */
const GSTIN_ID = process.env.NEXT_PUBLIC_GSTIN_ID ?? '';

export function getGstinId(): string {
  if (!GSTIN_ID) {
    throw new Error(
      'NEXT_PUBLIC_GSTIN_ID is not set. Set it in apps/web/.env.local (see .env.example).'
    );
  }
  return GSTIN_ID;
}