import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';
import { ZodPiPe } from 'src/interceptors/validation/validation.pipe';
import { idObjectSchema } from 'src/utils/schemas';
import { PalletsService } from './pallets.service';
import {
  createExportOrderSchema,
  createPalletsSchema,
  exportOrdersFilterSchema,
  palletJobsFilterSchema,
  palletsFilterSchema,
  updateContentSchema,
} from './pallets.schema';

// Permisos por submódulo (petición Juan 06-Oct): "Pallets" (capturar) y
// "Pallets Registrados" (consultar/editar/borrar) viven en este mismo
// controlador, así que el guard va POR RUTA, no por clase. OJO: un guard de
// clase NO se reemplaza con uno de método, se suman — por eso se quitó.
@Controller('quality/pallets')
export class PalletsController {
  constructor(private readonly palletsService: PalletsService) {}

  // ── Pallets (capturar) ──────────────────────────────────────────────
  @Get('jobs')
  @UseGuards(new AuthGuard('quality_pallets'))
  getJobs(@Query(new ZodPiPe(palletJobsFilterSchema)) query) {
    return this.palletsService.getJobs(query);
  }

  // folio que tomará el siguiente pallet nuevo (obs 07/09 — informativo)
  @Get('next-folio')
  @UseGuards(new AuthGuard('quality_pallets'))
  getNextFolio() {
    return this.palletsService.getNextFolio();
  }

  // ── Pallets Registrados ─────────────────────────────────────────────
  @Get('label')
  @UseGuards(new AuthGuard('quality_registered_pallets'))
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="pallet-label.pdf"')
  downloadLabel(@Query(new ZodPiPe(idObjectSchema)) query) {
    return this.palletsService.downloadLabel(query);
  }

  @Get()
  @UseGuards(new AuthGuard('quality_registered_pallets'))
  getPallets(@Query(new ZodPiPe(palletsFilterSchema)) query) {
    return this.palletsService.getPallets(query);
  }

  @Post()
  @UseGuards(new AuthGuard('quality_pallets'))
  create(@Body(new ZodPiPe(createPalletsSchema)) body) {
    return this.palletsService.create(body);
  }

  @Put('content')
  @UseGuards(new AuthGuard('quality_registered_pallets'))
  updateContent(@Body(new ZodPiPe(updateContentSchema)) body) {
    return this.palletsService.updateContent(body);
  }

  @Delete(':id')
  @UseGuards(new AuthGuard('quality_registered_pallets', { DELETE: 3 }))
  delete(@Param(new ZodPiPe(idObjectSchema)) params) {
    return this.palletsService.deletePallet(params);
  }
}

@Controller('quality/exportorders')
export class ExportOrdersController {
  constructor(private readonly palletsService: PalletsService) {}

  @Get('download')
  @UseGuards(new AuthGuard('quality_registered_exports'))
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="orden-exportacion.pdf"')
  download(@Query(new ZodPiPe(idObjectSchema)) query) {
    return this.palletsService.downloadExportOrder(query);
  }

  @Get()
  @UseGuards(new AuthGuard('quality_registered_exports'))
  list(@Query(new ZodPiPe(exportOrdersFilterSchema)) query) {
    return this.palletsService.getExportOrders(query);
  }

  // Se crea DESDE la pantalla de Pallets Registrados, por eso ese permiso
  @Post()
  @UseGuards(new AuthGuard('quality_registered_pallets'))
  create(@Body(new ZodPiPe(createExportOrderSchema)) body) {
    return this.palletsService.createExportOrder(body);
  }

  @Delete(':id')
  @UseGuards(new AuthGuard('quality_registered_exports', { DELETE: 3 }))
  delete(@Param(new ZodPiPe(idObjectSchema)) params) {
    return this.palletsService.deleteExportOrder(params);
  }
}
