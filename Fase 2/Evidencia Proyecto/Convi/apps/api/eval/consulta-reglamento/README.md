# Set de prueba de la consulta del reglamento con IA

Mide la consulta del reglamento (PB-117 a PB-119) con preguntas reales de Convivencia, cada una con la página que debería citar y las frases que su respuesta debe tener o no debe tener.

Usa el mismo código de la API y un Ollama local, sin base de datos ni nube: el reglamento se prepara aquí igual que en CONVI, con unpdf, los mismos fragmentos y bge-m3.

## Cómo correrlo

Necesitas las dependencias de `apps/api` instaladas y Ollama abierto con `bge-m3:567m-fp16` y `qwen3.5:9b`.

Desde `apps/api`:

```powershell
node --experimental-transform-types --no-warnings --import ./eval/consulta-reglamento/registrar.mjs eval/consulta-reglamento/evaluar.ts "C:\ruta\reglamento.pdf"
```

- Para correr solo algunas preguntas, agrega sus códigos al final, por ejemplo `P01,P03`.
- Si Ollama está en otra dirección, defínela antes en `OLLAMA_URL`.
- El reglamento se prepara una sola vez y queda en `.cache`, junto al detalle de cada corrida con todas las respuestas, y esa carpeta no se sube a Git.

## Cómo se califica cada respuesta

- **OK:** cita la página esperada, dice lo esencial y no mezcla otro caso.
- **CITA_OTRA:** responde con otras páginas.
- **LE_FALTA_LO_CLAVE:** cita la página, pero no dice lo esencial, por ejemplo el plazo de 30 minutos.
- **MEZCLA_OTRO_CASO:** agrega lo que el reglamento dice para otra situación, por ejemplo cuando el agresor es el apoderado.
- **SIN_DISPOSICION:** CONVI respondió que el reglamento no regula lo preguntado.
- **INVENTA:** en una pregunta sin respuesta en el reglamento, contestó igual.

## Resultados con el reglamento del Liceo MAZZ, 28 de noviembre de 2026

Son 21 preguntas: 19 con respuesta en el reglamento y 2 que deben terminar en "sin disposición".

| Versión                            | Correctas | Página encontrada | Tiempo promedio |
| ---------------------------------- | --------- | ----------------- | --------------- |
| Antes, una búsqueda                | 17 de 21  | 17 de 19          | 2,7 s           |
| Ahora, con reescritura y selección | 18 de 21  | 18 de 19          | 4,4 s           |

El cambio principal está en la pregunta P01, la que reportó Sebastián:

- **Antes:** citaba el deber de denunciar y el caso del apoderado agresor, que no corresponden.
- **Ahora:** responde con el protocolo de la página 75, donde el Inspector General avisa por teléfono a los apoderados en menos de 30 minutos y les pide ir al liceo.

Quedan por mejorar:

- **P03:** el plazo de aviso al apoderado en una pelea, que ahora responde "sin disposición" en vez de inventar un plazo de 24 horas.
- **P12:** un estudiante que amenaza a una profesora, que cita la falta grave de las páginas 66 y 67 pero no el protocolo de la página 85.
- **P16:** las burlas por Instagram, que cita la definición de acoso de la página 43 y no el protocolo de redes sociales de la página 88.

Ten en cuenta estos límites:

- El modelo corre en la GPU con temperatura 0, pero el resultado puede variar un poco entre corridas.
- Hay un solo reglamento y 21 preguntas, así que los números muestran la tendencia y no una precisión exacta.
- Los tiempos se midieron en el PC de Camilo con una RTX 4070, con los modelos ya cargados.
