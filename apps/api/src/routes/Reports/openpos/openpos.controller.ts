import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';
import { ZodPiPe } from 'src/interceptors/validation/validation.pipe';
import { OpenPosService } from './openpos.service';
import { openPosFilterSchema } from './openpos.schema';

// Mismo permiso que Reportes → Órdenes (reports_orders)
@Controller('reports/open-pos')
@UseGuards(new AuthGuard('reports_orders'))
export class OpenPosController {
  constructor(private readonly openPosService: OpenPosService) {}

  @Get()
  get(@Query(new ZodPiPe(openPosFilterSchema)) query) {
    return this.openPosService.get(query);
  }

  @Get('excel')
  @Header('Content-Disposition', 'attachment; filename=PO-abiertos.xlsx')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  excel(@Query(new ZodPiPe(openPosFilterSchema)) query) {
    return this.openPosService.excel(query);
  }
}
