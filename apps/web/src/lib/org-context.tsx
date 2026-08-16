'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError } from './api-client';
import {
  fetchGstins,
  fetchMyOrganizations,
  type GstinSummary,
  type OrgSummary,
} from './org';

/**
 * Org/GSTIN selection state for the authenticated session.
 *
 * The selected org/gstin ids are persisted in localStorage so the choice
 * survives reloads. This is NOT sensitive the way the auth token is (it's a
 * tenant id, not a credential), so localStorage is acceptable here — unlike
 * the token, which must move to an httpOnly cookie before production.
 */

const ORG_KEY = 'vittixbiz_selected_org_id';
const GSTIN_KEY = 'vittixbiz_selected_gstin_id';

const CREATE_ORG_PATH = '/organizations/new';

interface OrgContextValue {
  orgs: OrgSummary[];
  selectedOrg: OrgSummary | null;
  selectOrg: (id: string) => void;
  gstins: GstinSummary[];
  selectedGstin: GstinSummary | null;
  selectGstin: (id: string) => void;
  refreshOrgs: () => Promise<void>;
  refreshGstins: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const OrgContext = createContext<OrgContextValue | null>(null);

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function store(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() =>
    readStored(ORG_KEY)
  );
  const [gstins, setGstins] = useState<GstinSummary[]>([]);
  const [selectedGstinId, setSelectedGstinId] = useState<string | null>(() =>
    readStored(GSTIN_KEY)
  );
  const [error, setError] = useState<string | null>(null);

  const refreshOrgs = useCallback(async () => {
    try {
      const rows = await fetchMyOrganizations();
      setOrgs(rows);
      setOrgsLoaded(true);
      setError(null);
    } catch (err) {
      setOrgsLoaded(true);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to load your organizations.'
      );
    }
  }, []);

  // Load the org list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMyOrganizations();
        if (cancelled) return;
        setOrgs(rows);
        setOrgsLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setOrgsLoaded(true);
        setError(
          err instanceof ApiError
            ? err.message
            : 'Unable to load your organizations.'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Zero orgs and not already on the create page → go create one.
  useEffect(() => {
    if (
      orgsLoaded &&
      !error &&
      orgs.length === 0 &&
      pathname !== CREATE_ORG_PATH
    ) {
      router.replace(CREATE_ORG_PATH);
    }
  }, [orgsLoaded, error, orgs.length, pathname, router]);

  // Auto-select the first/only org once nothing is persisted yet.
  const selectedOrg = useMemo(() => {
    if (!orgsLoaded || orgs.length === 0) return null;
    return orgs.find((o) => o.id === selectedOrgId) ?? orgs[0];
  }, [orgs, orgsLoaded, selectedOrgId]);

  useEffect(() => {
    if (selectedOrg && !selectedOrgId) {
      setSelectedOrgId(selectedOrg.id);
      store(ORG_KEY, selectedOrg.id);
    }
  }, [selectedOrg, selectedOrgId]);

  const selectOrg = useCallback((id: string) => {
    setSelectedOrgId(id);
    store(ORG_KEY, id);
  }, []);

  // Load GSTINs whenever the selected org changes.
  useEffect(() => {
    if (!selectedOrg) {
      setGstins([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchGstins(selectedOrg.id);
        if (!cancelled) setGstins(rows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Unable to load GSTINs.'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrg]);

  // Auto-select the first/only GSTIN once nothing is persisted yet.
  const selectedGstin = useMemo(() => {
    if (gstins.length === 0) return null;
    return gstins.find((g) => g.id === selectedGstinId) ?? gstins[0];
  }, [gstins, selectedGstinId]);

  useEffect(() => {
    if (selectedGstin && !selectedGstinId) {
      setSelectedGstinId(selectedGstin.id);
      store(GSTIN_KEY, selectedGstin.id);
    }
  }, [selectedGstin, selectedGstinId]);

  const selectGstin = useCallback((id: string) => {
    setSelectedGstinId(id);
    store(GSTIN_KEY, id);
  }, []);

  // Refetch the GSTIN list for the currently selected org (e.g. right after
  // creating a new GSTIN so it shows up without a full reload).
  const refreshGstins = useCallback(async () => {
    if (!selectedOrg) return;
    try {
      const rows = await fetchGstins(selectedOrg.id);
      setGstins(rows);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to load GSTINs.'
      );
    }
  }, [selectedOrg]);

  const value = useMemo<OrgContextValue>(
    () => ({
      orgs,
      selectedOrg,
      selectOrg,
      gstins,
      selectedGstin,
      selectGstin,
      refreshOrgs,
      refreshGstins,
      loading: !orgsLoaded,
      error,
    }),
    [
      orgs,
      selectedOrg,
      selectOrg,
      gstins,
      selectedGstin,
      selectGstin,
      refreshOrgs,
      refreshGstins,
      orgsLoaded,
      error,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error('useOrg must be used within OrgProvider.');
  }
  return ctx;
}