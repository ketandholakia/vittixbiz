import { Card, CardBody } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your billing will live here."
      />
      <Card>
        <CardBody>
          <p className="text-sm text-slate-600">
            This page is a placeholder for now. Use the navigation above to
            manage customers and invoices.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}