import type { ReactNode } from 'react';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
}

export function Th({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-200 bg-white">{children}</tbody>;
}

export function Td({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-3.5 text-sm text-slate-700 ${className}`}>{children}</td>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={99} className="px-5 py-10 text-center text-sm text-slate-500">
          {message}
        </td>
      </tr>
    </tbody>
  );
}