'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api-client';
import { OrgProvider, useOrg } from '@/lib/org-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Alert } from '@/components/ui/alert';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { loading, error } = useOrg();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error ? (
          <div className="mb-6">
            <Alert kind="error">{error}</Alert>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Route guard: the token lives in localStorage (client-only), so the check
  // runs on the client. Redirect to /login when no token is present.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    // Avoid flashing the shell before the guard resolves.
    return null;
  }

  return (
    <OrgProvider>
      <DashboardShell>{children}</DashboardShell>
    </OrgProvider>
  );
}