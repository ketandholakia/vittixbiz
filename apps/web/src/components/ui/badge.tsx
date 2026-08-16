import type { InvoiceStatus } from '@/lib/api-types';

const styles: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  issued: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
};

const labels: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}