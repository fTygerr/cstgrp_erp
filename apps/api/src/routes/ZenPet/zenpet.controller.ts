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

  @Get('stages')
  getStages() {
    return this.zenpetService.getStages();
  }

  @Get('formulas')
  getFormulas() {
    return this.zenpetService.getFormulas();
  }
}
