import {
  Body,
  Controller,
  Get,
  Header,
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
  downloadPackingListSchema,
  editPackingListSchema,
} from './packing-list.schema';
import { idObjectSchema } from 'src/utils/schemas';

@Controller('ie/packing-list')
@UseGuards(new AuthGuard('exports'))
export class PackingListController {
  constructor(private readonly packingListService: PackingListService) {}

  @Get('options')
  getOptions() {
    return this.packingListService.getOptions();
  }

  @Get('data')
  getData(@Query(new ZodPiPe(idObjectSchema)) params) {
    return this.packingListService.getData(params);
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
}
