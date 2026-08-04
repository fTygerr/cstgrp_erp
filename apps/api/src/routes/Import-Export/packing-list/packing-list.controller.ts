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
import { PackingListService } from './packing-list.service';
import {
  applyExportOrderSchema,
  createInventoryPlSchema,
  createPackingListSchema,
  downloadPackingListSchema,
  editPackingListSchema,
  getPackingListsSchema,
  previewPackingListSchema,
  updatePlDataSchema,
} from './packing-list.schema';
import { idObjectSchema } from 'src/utils/schemas';

// Generación de PLs desde la pantalla de Exportaciones (permiso 'exports')
@Controller('ie/packing-list-generate')
@UseGuards(new AuthGuard('exports'))
export class PackingListGenerateController {
  constructor(private readonly packingListService: PackingListService) {}

  @Get('options')
  getOptions() {
    return this.packingListService.getOptions();
  }

  @Get('next-folio')
  getNextFolio() {
    return this.packingListService.getNextFolio();
  }

  @Post('preview')
  preview(@Body(new ZodPiPe(previewPackingListSchema)) body) {
    return this.packingListService.preview(body);
  }

  @Post('')
  create(@Body(new ZodPiPe(createPackingListSchema)) body) {
    return this.packingListService.create(body);
  }

  @Post('inventory')
  createInventory(@Body(new ZodPiPe(createInventoryPlSchema)) body) {
    return this.packingListService.createInventory(body);
  }
}

// Submódulo Packing List (permiso propio; eliminar requiere nivel 3)
@Controller('ie/packing-list')
@UseGuards(new AuthGuard('ie_packing_list', { DELETE: 3 }))
export class PackingListController {
  constructor(private readonly packingListService: PackingListService) {}

  @Get('')
  getPackingLists(@Query(new ZodPiPe(getPackingListsSchema)) query) {
    return this.packingListService.getPackingLists(query);
  }

  @Get('options')
  getOptions() {
    return this.packingListService.getOptions();
  }

  @Get('data')
  getData(@Query(new ZodPiPe(idObjectSchema)) params) {
    return this.packingListService.getData(params);
  }

  @Put('data')
  updatePlData(@Body(new ZodPiPe(updatePlDataSchema)) body) {
    return this.packingListService.updatePlData(body);
  }

  @Get('download')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="packing-list.pdf"')
  download(@Query(new ZodPiPe(downloadPackingListSchema)) params) {
    return this.packingListService.download(params);
  }

  @Get('exportorders')
  getExportOrders(@Query(new ZodPiPe(idObjectSchema)) params) {
    return this.packingListService.getExportOrders(params);
  }

  @Post('apply-exportorder')
  applyExportOrder(@Body(new ZodPiPe(applyExportOrderSchema)) body) {
    return this.packingListService.applyExportOrder(body);
  }

  @Post('remove-exportorder')
  removeExportOrder(@Body(new ZodPiPe(applyExportOrderSchema)) body) {
    return this.packingListService.removeExportOrder(body);
  }

  @Get('desglose')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="desglose-pallets.pdf"')
  downloadDesglose(@Query(new ZodPiPe(idObjectSchema)) params) {
    return this.packingListService.downloadDesglose(params);
  }

  @Put('')
  update(@Body(new ZodPiPe(editPackingListSchema)) body) {
    return this.packingListService.update(body);
  }

  @Delete(':id')
  delete(@Param(new ZodPiPe(idObjectSchema)) params) {
    return this.packingListService.deletePl(params);
  }
}
