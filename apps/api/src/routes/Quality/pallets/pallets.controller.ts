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

@Controller('quality/pallets')
@UseGuards(new AuthGuard('quality'))
export class PalletsController {
  constructor(private readonly palletsService: PalletsService) {}

  @Get('jobs')
  getJobs(@Query(new ZodPiPe(palletJobsFilterSchema)) query) {
    return this.palletsService.getJobs(query);
  }

  @Get('label')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="pallet-label.pdf"')
  downloadLabel(@Query(new ZodPiPe(idObjectSchema)) query) {
    return this.palletsService.downloadLabel(query);
  }

  @Get()
  getPallets(@Query(new ZodPiPe(palletsFilterSchema)) query) {
    return this.palletsService.getPallets(query);
  }

  @Post()
  create(@Body(new ZodPiPe(createPalletsSchema)) body) {
    return this.palletsService.create(body);
  }

  @Put('content')
  updateContent(@Body(new ZodPiPe(updateContentSchema)) body) {
    return this.palletsService.updateContent(body);
  }

  @Delete(':id')
  delete(@Param(new ZodPiPe(idObjectSchema)) params) {
    return this.palletsService.deletePallet(params);
  }
}

@Controller('quality/exportorders')
@UseGuards(new AuthGuard('quality'))
export class ExportOrdersController {
  constructor(private readonly palletsService: PalletsService) {}

  @Get('download')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="orden-exportacion.pdf"')
  download(@Query(new ZodPiPe(idObjectSchema)) query) {
    return this.palletsService.downloadExportOrder(query);
  }

  @Get()
  list(@Query(new ZodPiPe(exportOrdersFilterSchema)) query) {
    return this.palletsService.getExportOrders(query);
  }

  @Post()
  create(@Body(new ZodPiPe(createExportOrderSchema)) body) {
    return this.palletsService.createExportOrder(body);
  }

  @Delete(':id')
  delete(@Param(new ZodPiPe(idObjectSchema)) params) {
    return this.palletsService.deleteExportOrder(params);
  }
}
