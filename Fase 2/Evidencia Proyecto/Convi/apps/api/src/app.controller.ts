import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Publica } from './common/acceso.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Publica()
  getHello(): string {
    return this.appService.getHello();
  }
}
