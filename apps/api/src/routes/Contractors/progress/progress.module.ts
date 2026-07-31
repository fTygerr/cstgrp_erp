import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { MovementController } from './movement.controller';
import { ContextProvider } from 'src/interceptors/context.provider';

@Module({
  controllers: [MovementController, ProgressController],
  providers: [
    ProgressService,
    ContextProvider,
    {
      provide: 'MODULE',
      useValue: 'production',
    },
  ],
})
export class ProgressModule {}
