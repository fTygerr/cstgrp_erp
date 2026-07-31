import { Body, Controller, Delete, Put, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { deleteMovementSchema, editMovementSchema } from './progress.schema';
import { ZodPiPe } from 'src/interceptors/validation/validation.pipe';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';

@Controller('contractors/progress/movement')
@UseGuards(new AuthGuard('contractors_orders', { PUT: 3, DELETE: 3 }))
export class MovementController {
  constructor(private readonly progressService: ProgressService) {}

  @Put('')
  editMovement(@Body(new ZodPiPe(editMovementSchema)) body) {
    return this.progressService.editMovement(body);
  }

  @Delete('')
  deleteMovement(@Body(new ZodPiPe(deleteMovementSchema)) body) {
    return this.progressService.deleteMovement(body);
  }
}
