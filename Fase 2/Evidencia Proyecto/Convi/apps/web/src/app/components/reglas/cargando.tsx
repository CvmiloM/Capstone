// PB-089: pantalla de carga de las reglas de aviso. Cada ruta necesita la suya:
// al navegar desde otra sección, la del portal ya está montada y no envuelve
// los datos de esta página (cacheComponents la marca como bloqueante).
export default function CargandoReglas() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
