import { Card, CardBody } from '@/components/ui/card';
import { CustomerForm } from '@/components/customers/customer-form';
import { PageHeader } from '@/components/ui/page-header';

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New customer"
        description="Add a buyer you will invoice."
      />
      <Card>
        <CardBody>
          <CustomerForm />
        </CardBody>
      </Card>
    </div>
  );
}