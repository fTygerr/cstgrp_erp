import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module';
import { PalletsModule } from './pallets/pallets.module';

@Module({
  imports: [OrdersModule, PalletsModule],
})
export class QualityModule {}
