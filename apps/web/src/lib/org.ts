import { apiFetch, jsonBody } from './api-client';

/**
 * Organization / GSTIN discovery backed by the real API.
 *
 * Response shapes match apps/api/src/organizations/:
 *  - GET  /me/organizations            (listForUser)
 *  - POST /organizations               (create)
 *  - GET  /organizations/:orgId/gstins (listGstins)
 */
export interface OrgSummary {
  id: string;
  legalName: string;
  tradeName: string | null;
  role: string;
}

export interface GstinSummary {
  id: string;
  gstin: string;
  branchName: string;
  stateCode: string;
  status: string;
}

export function fetchMyOrganizations(): Promise<OrgSummary[]> {
  return apiFetch<OrgSummary[]>('/me/organizations');
}

export function createOrganization(input: {
  legalName: string;
  tradeName?: string | null;
  panNumber?: string | null;
  defaultCurrency?: string;
  fiscalYearStartMonth?: number;
}): Promise<OrgSummary> {
  return apiFetch<OrgSummary>('/organizations', jsonBody(input));
}

export function fetchGstins(orgId: string): Promise<GstinSummary[]> {
  return apiFetch<GstinSummary[]>(`/organizations/${orgId}/gstins`);
}