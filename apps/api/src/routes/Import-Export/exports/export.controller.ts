import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';
import { ExportService } from './export.service';
import { getExportSchema, getInventoryExportSchema } from './export.schema';
import { ZodPiPe } from 'src/interceptors/validation/validation.pipe';

@Controller('ie/exports')
@UseGuards(new AuthGuard('exports'))
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  async findAll(@Query(new ZodPiPe(getExportSchema)) query) {
    return this.exportService.findAll(query);
  }

  @Get('inventory')
  async findInventory(@Query(new ZodPiPe(getInventoryExportSchema)) query) {
    return this.exportService.findInventory(query);
  }
}
