import { Module } from '@nestjs/common';
import { OpenPosService } from './openpos.service';
import { OpenPosController } from './openpos.controller';
import { ContextProvider } from 'src/interceptors/context.provider';

@Module({
  controllers: [OpenPosController],
  providers: [
    OpenPosService,
    ContextProvider,
    {
      provide: 'MODULE',
      useValue: 'reports',
    },
  ],
})
export class OpenPosModule {}
