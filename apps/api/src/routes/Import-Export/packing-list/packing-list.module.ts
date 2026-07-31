import { Module } from '@nestjs/common';
import {
  PackingListController,
  PackingListGenerateController,
} from './packing-list.controller';
import { ContextProvider } from 'src/interceptors/context.provider';
import { PackingListService } from './packing-list.service';

@Module({
  controllers: [PackingListGenerateController, PackingListController],
  providers: [
    PackingListService,
    ContextProvider,
    {
      provide: 'MODULE',
      useValue: 'ie',
    },
  ],
})
export class PackingListModule {}
