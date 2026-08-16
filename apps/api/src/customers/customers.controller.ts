import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextGuard } from '../tenants/tenant-context.guard';
import { withTenantTransaction } from '../database/tenant-transaction';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';
import { createCustomerSchema, updateCustomerSchema } from './customers.dto';
import type {
  CreateCustomerDto,
  UpdateCustomerDto,
} from './customers.dto';

@Controller('organizations/:orgId/customers')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto
  ) {
    return withTenantTransaction(orgId, (tx) =>
      this.customersService.create(tx, orgId, body)
    );
  }

  @Get()
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return withTenantTransaction(orgId, (tx) =>
      this.customersService.list(tx, orgId)
    );
  }

  @Get(':id')
  getOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return withTenantTransaction(orgId, async (tx) => {
      const customer = await this.customersService.getById(tx, orgId, id);
      if (!customer) {
        throw new NotFoundException('Customer not found.');
      }
      return customer;
    });
  }

  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto
  ) {
    return withTenantTransaction(orgId, async (tx) => {
      const updated = await this.customersService.update(tx, orgId, id, body);
      if (!updated) {
        throw new NotFoundException('Customer not found.');
      }
      return updated;
    });
  }
}