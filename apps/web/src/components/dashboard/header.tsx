'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api-client';
import { useOrg } from '@/lib/org-context';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/invoices', label: 'Invoices' },
];

export function DashboardHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { orgs, selectedOrg, selectOrg } = useOrg();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-slate-900"
          >
            VittixBiz
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {orgs.length > 1 ? (
            <Select
              aria-label="Switch organization"
              value={selectedOrg?.id ?? ''}
              onChange={(e) => selectOrg(e.target.value)}
              className="w-52"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.legalName}
                </option>
              ))}
            </Select>
          ) : selectedOrg ? (
            <span className="max-w-52 truncate text-sm font-medium text-slate-700">
              {selectedOrg.legalName}
            </span>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              clearToken();
              router.replace('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}