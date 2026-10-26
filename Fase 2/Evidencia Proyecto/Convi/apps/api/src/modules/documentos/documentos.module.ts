import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentosController } from './documentos.controller.js';
import { DocumentosService, DOCUMENTOS_STORAGE } from './documentos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DocumentosController],
  providers: [
    DocumentosService,
    {
      provide: DOCUMENTOS_STORAGE,
      useFactory: () => {
        const url = process.env.SUPABASE_URL;
        const clave =
          process.env.SUPABASE_SECRET_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !clave)
          throw new Error('Falta configurar Storage en la API');
        return createClient(url, clave, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      },
    },
  ],
})
export class DocumentosModule {}
