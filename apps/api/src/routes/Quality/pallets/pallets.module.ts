import { Module } from '@nestjs/common';
import { PalletsController, ExportOrdersController } from './pallets.controller';
import { PalletsService } from './pallets.service';
import { ContextProvider } from 'src/interceptors/context.provider';

@Module({
  controllers: [PalletsController, ExportOrdersController],
  providers: [
    PalletsService,
    ContextProvider,
    {
      provide: 'MODULE',
      useValue: 'quality',
    },
  ],
})
export class PalletsModule {}
