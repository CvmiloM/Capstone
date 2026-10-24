import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AcademicoModule } from './modules/academico/academico.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriasModule } from './modules/categorias/categorias.module.js';
import { CuentasModule } from './modules/cuentas/cuentas.module.js';
import { ImportacionesModule } from './modules/importaciones/importaciones.module.js';
import { ProtocolosModule } from './modules/protocolos/protocolos.module.js';
import { RegistroModule } from './modules/registro/registro.module.js';
import { ReglasModule } from './modules/reglas/reglas.module.js';
import { SituacionesModule } from './modules/situaciones/situaciones.module.js';

@Module({
  imports: [
    AcademicoModule,
    AdminModule,
    AuthModule,
    CategoriasModule,
    CuentasModule,
    ImportacionesModule,
    ProtocolosModule,
    RegistroModule,
    ReglasModule,
    SituacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
