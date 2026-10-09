import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Identidad } from '../../common/sesion.js';

export const SUPABASE_AUTH = Symbol('supabase-auth');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class IdentidadService {
  constructor(
    @Inject(SUPABASE_AUTH) private readonly supabase: SupabaseClient,
  ) {}

  async verificar(token: string): Promise<Identidad> {
    try {
      // Supabase comprueba la firma y vencimiento; no basta con leer el token.
      const { data, error } = await this.supabase.auth.getClaims(token);
      if (error && (!error.status || error.status >= 500)) {
        throw new ServiceUnavailableException(
          'No se pudo verificar la sesión.',
        );
      }
      const claims = data?.claims;
      if (
        error ||
        !claims ||
        !UUID.test(claims.sub) ||
        claims.role !== 'authenticated' ||
        !(
          claims.aud === 'authenticated' ||
          (Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
        ) ||
        (claims.aal !== 'aal1' && claims.aal !== 'aal2')
      ) {
        throw new UnauthorizedException('Sesión no válida.');
      }
      // Comprobamos también que la identidad siga existiendo en Auth.
      const { data: usuario, error: errorUsuario } =
        await this.supabase.auth.getUser(token);
      if (
        errorUsuario &&
        (!errorUsuario.status || errorUsuario.status >= 500)
      ) {
        throw new ServiceUnavailableException(
          'No se pudo verificar la sesión.',
        );
      }
      if (errorUsuario || usuario.user?.id !== claims.sub) {
        throw new UnauthorizedException('Sesión no válida.');
      }
      // Supabase aporta la identidad; el perfil y la escuela se resolverán en la base.
      return {
        authUsuarioId: claims.sub,
        aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      // No devolvemos errores internos que puedan contener el token o credenciales.
      throw new UnauthorizedException('Sesión no válida.');
    }
  }
}
