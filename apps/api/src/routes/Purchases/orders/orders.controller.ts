import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Put,
  Delete,
  Query,
  Param,
  Header,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { ZodPiPe } from 'src/interceptors/validation/validation.pipe';
import {
  deleteSchema,
  editSchema,
  createSchema,
  getProductsSchema,
  searchSchema,
} from './orders.schema';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';

@Controller('purchases/orders')
@UseGuards(new AuthGuard('purchases'))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  get(@Query(new ZodPiPe(searchSchema)) body) {
    return this.ordersService.findAllOrders(body);
  }

  @Post()
  register(@Body(new ZodPiPe(createSchema)) body) {
    return this.ordersService.createOrder(body);
  }

  @Put()
  edit(@Body(new ZodPiPe(editSchema)) body) {
    return this.ordersService.editOrder(body);
  }

  @Delete()
  delete(@Body(new ZodPiPe(deleteSchema)) body) {
    return this.ordersService.deleteOrder(body);
  }

  @Put('close')
  closeOrder(@Body() body: any) {
    return this.ordersService.closeOrder({ id: Number(body.id), date: body.date });
  }

  @Get('export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="ordenes-compra.xlsx"')
  exportOrders() {
    return this.ordersService.exportOrders();
  }

  @Get('basic-data')
  getBasicData() {
    return this.ordersService.getBasicData();
  }

  @Get('products')
  getProducts(@Query(new ZodPiPe(getProductsSchema)) body) {
    return this.ordersService.getProducts(body);
  }

  @Get('download/:id')
  download(@Param(new ZodPiPe(deleteSchema)) body) {
    return this.ordersService.download(body);
  }
}
