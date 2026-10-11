import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { SituacionesModule } from './modules/situaciones/situaciones.module.js';

@Module({
  imports: [AuthModule, SituacionesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
