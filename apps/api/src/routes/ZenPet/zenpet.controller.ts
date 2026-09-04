import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/interceptors/auth/authorization.guard';
import { ZenPetService } from './zenpet.service';

@Controller('zenpet')
@UseGuards(new AuthGuard('zenpet'))
export class ZenPetController {
  constructor(private readonly zenpetService: ZenPetService) {}

  @Get('etapas')
  getEtapas() {
    return this.zenpetService.getEtapas();
  }

  // detalle por material para la página del ERP; separado de /etapas a propósito
  // para no cambiar aún el payload que consume la app de ZenPet (Hector 01/09)
  @Get('materials')
  getRawMaterials() {
    return this.zenpetService.getRawMaterials();
  }

  // producto terminado Z0 (fase 13) — items + agregado {skus, units}
  @Get('finished-goods')
  getFinishedGoods() {
    return this.zenpetService.getFinishedGoods();
  }

  @Get('stages')
  getStages() {
    return this.zenpetService.getStages();
  }

  @Get('formulas')
  getFormulas() {
    return this.zenpetService.getFormulas();
  }
}
