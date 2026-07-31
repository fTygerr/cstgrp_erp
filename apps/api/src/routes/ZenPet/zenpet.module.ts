import { Module } from '@nestjs/common';
import { ZenPetController } from './zenpet.controller';
import { ZenPetService } from './zenpet.service';
import { ContextProvider } from 'src/interceptors/context.provider';

@Module({
  controllers: [ZenPetController],
  providers: [
    ZenPetService,
    ContextProvider,
    {
      provide: 'MODULE',
      useValue: 'zenpet',
    },
  ],
})
export class ZenPetModule {}
