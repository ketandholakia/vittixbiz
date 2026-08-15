import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { LedgerModule } from './ledger/ledger.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TaxModule } from './tax/tax.module';
import { GstnIntegrationModule } from './gstn-integration/gstn-integration.module';

@Module({
  imports: [AuthModule, TenantsModule, LedgerModule, InvoicesModule, TaxModule, GstnIntegrationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
