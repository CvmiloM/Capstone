import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GestionController } from './gestion.controller.js';
import { GestionService } from './gestion.service.js';

@Module({
  imports: [AuthModule],
  controllers: [GestionController],
  providers: [GestionService],
})
export class GestionModule {}
