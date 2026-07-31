import { Module } from '@nestjs/common';
import { PalletsModule } from './pallets/pallets.module';

@Module({
  imports: [PalletsModule],
})
export class QualityModule {}
