import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AcademicoModule } from './modules/academico/academico.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RegistroModule } from './modules/registro/registro.module.js';
import { SituacionesModule } from './modules/situaciones/situaciones.module.js';

@Module({
  imports: [AcademicoModule, AuthModule, RegistroModule, SituacionesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}