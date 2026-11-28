// Permite importar los .ts del proyecto con sus rutas '.js', como hace el compilador.
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto);
  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      especificador.endsWith('.js') &&
      especificador.startsWith('.')
    )
      return siguiente(especificador.slice(0, -3) + '.ts', contexto);
    throw error;
  }
}
