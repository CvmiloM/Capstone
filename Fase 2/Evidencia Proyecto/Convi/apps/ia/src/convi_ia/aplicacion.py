"""Aplicación FastAPI de convi-ia.

POST /api/embed (PB-079) y POST /api/chat (PB-118) siguen el contrato de Ollama, y
GET /salud revisa Ollama y los dos modelos. Nunca se registra ni se devuelve el texto
que llega, solo cantidades y tiempos.
"""

import hmac
import json
import logging
import math
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .configuracion import (
    DIMENSIONES_EMBEDDING,
    ESPERA_GENERACION,
    ESPERA_OLLAMA,
    MANTENER_CARGADO,
    MAXIMO_CARACTERES,
    MAXIMO_CARACTERES_MENSAJE,
    MAXIMO_CUERPO,
    MAXIMO_MENSAJES,
    MAXIMO_TEXTOS,
    MODELO_EMBEDDING,
    MODELO_GENERACION,
    Configuracion,
)

registro = logging.getLogger("convi_ia")

RUTA_EMBED = "/api/embed"
RUTA_CHAT = "/api/chat"
RUTAS_PROTEGIDAS = {RUTA_EMBED, RUTA_CHAT}
MAXIMO_FLOAT32 = 3.4028234663852886e38
# Ocho vectores de 1024 números ocupan unos 100 KB, el margen cubre los campos extra de Ollama.
MAXIMO_RESPUESTA_OLLAMA = 2 * 1024 * 1024
MAXIMO_RESPUESTA_GENERACION = 64 * 1024


def falta(modelo: str) -> str:
    return f"falta, ejecuta ollama pull {modelo}"


class SolicitudEmbeddings(BaseModel):
    """Lo mismo que manda generarEmbeddings en la API: modelo, textos y truncate en false."""

    model_config = ConfigDict(extra="forbid", strict=True)

    model: str
    input: list[str] = Field(min_length=1, max_length=MAXIMO_TEXTOS)
    truncate: bool = False

    @field_validator("model")
    @classmethod
    def modelo_requerido(cls, valor: str) -> str:
        if valor != MODELO_EMBEDDING:
            raise ValueError(f"el modelo debe ser {MODELO_EMBEDDING}")
        return valor

    @field_validator("input")
    @classmethod
    def textos_validos(cls, textos: list[str]) -> list[str]:
        for texto in textos:
            if not texto.strip():
                raise ValueError("ningún texto puede venir vacío")
            if len(texto) > MAXIMO_CARACTERES:
                raise ValueError(f"cada texto puede tener hasta {MAXIMO_CARACTERES} caracteres")
        return textos

    @field_validator("truncate")
    @classmethod
    def sin_recorte(cls, valor: bool) -> bool:
        # Recortar en silencio dejaría fragmentos guardados con un vector de otro texto.
        if valor:
            raise ValueError("truncate debe ser false")
        return valor


class Mensaje(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    # Sin historial ni respuestas previas: cada consulta es independiente (decisión del PO).
    role: Literal["system", "user"]
    content: str = Field(min_length=1, max_length=MAXIMO_CARACTERES_MENSAJE)


class SolicitudChat(BaseModel):
    """Lo que manda la API para redactar: el modelo, los mensajes y el esquema JSON pedido."""

    model_config = ConfigDict(extra="forbid", strict=True)

    model: str
    messages: list[Mensaje] = Field(min_length=1, max_length=MAXIMO_MENSAJES)
    format: dict[str, Any]
    stream: bool = False

    @field_validator("model")
    @classmethod
    def modelo_requerido(cls, valor: str) -> str:
        if valor != MODELO_GENERACION:
            raise ValueError(f"el modelo debe ser {MODELO_GENERACION}")
        return valor

    @field_validator("format")
    @classmethod
    def esquema_de_objeto(cls, valor: dict[str, Any]) -> dict[str, Any]:
        # La API siempre pide una respuesta estructurada que después valida ella.
        if valor.get("type") != "object" or not isinstance(valor.get("properties"), dict):
            raise ValueError("format debe ser un esquema JSON de tipo object")
        return valor

    @field_validator("stream")
    @classmethod
    def sin_flujo(cls, valor: bool) -> bool:
        if valor:
            raise ValueError("stream debe ser false")
        return valor


def vectores_validos(datos: Any, cantidad: int) -> list[list[float]] | None:
    """Las mismas reglas de validarEmbeddings en la API, para fallar aquí con un motivo claro."""
    if not isinstance(datos, dict) or datos.get("model") != MODELO_EMBEDDING:
        return None
    vectores = datos.get("embeddings")
    if not isinstance(vectores, list) or len(vectores) != cantidad:
        return None
    for vector in vectores:
        if not isinstance(vector, list) or len(vector) != DIMENSIONES_EMBEDDING:
            return None
        for numero in vector:
            # type() y no isinstance(), porque True y False también son int en Python.
            if type(numero) not in (int, float) or not math.isfinite(numero):
                return None
            if abs(numero) > MAXIMO_FLOAT32:
                return None
        if not any(numero != 0 for numero in vector):
            return None
    return vectores


def error(estado: int, detalle: str) -> JSONResponse:
    return JSONResponse({"detail": detalle}, status_code=estado)


class ProteccionRutas:
    """Revisa el token y el tamaño del cuerpo antes de que FastAPI lea la solicitud."""

    def __init__(self, app: ASGIApp, token: str | None) -> None:
        self.app = app
        self.esperado = f"Bearer {token}".encode() if token else None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] not in RUTAS_PROTEGIDAS:
            await self.app(scope, receive, send)
            return
        cabeceras = {nombre.lower(): valor for nombre, valor in scope["headers"]}
        if self.esperado is not None and not hmac.compare_digest(
            cabeceras.get(b"authorization", b""), self.esperado
        ):
            respuesta = JSONResponse(
                {"detail": "No autorizado"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await respuesta(scope, receive, send)
            return
        largo = cabeceras.get(b"content-length")
        if largo is not None and (not largo.isdigit() or int(largo) > MAXIMO_CUERPO):
            await error(413, "La solicitud supera el tamaño permitido")(scope, receive, send)
            return
        cuerpo = bytearray()
        while True:
            mensaje = await receive()
            if mensaje["type"] == "http.disconnect":
                return
            cuerpo += mensaje.get("body", b"")
            if len(cuerpo) > MAXIMO_CUERPO:
                await error(413, "La solicitud supera el tamaño permitido")(scope, receive, send)
                return
            if not mensaje.get("more_body", False):
                break
        entregado = False

        async def recibir() -> Message:
            nonlocal entregado
            if not entregado:
                entregado = True
                return {"type": "http.request", "body": bytes(cuerpo), "more_body": False}
            return await receive()

        await self.app(scope, recibir, send)


async def solicitud_invalida(_: Request, excepcion: Exception) -> JSONResponse:
    # Se devuelven el campo y el motivo, nunca el valor recibido, que puede ser texto del documento.
    errores = excepcion.errors() if isinstance(excepcion, RequestValidationError) else []
    detalle = [
        {"campo": ".".join(str(p) for p in e.get("loc", ())[1:]), "motivo": e.get("msg", "")}
        for e in errores
    ]
    return JSONResponse(
        {"detail": "La solicitud no cumple el contrato del servicio de IA", "errores": detalle},
        status_code=400,
    )


async def llamar_ollama(
    cliente: httpx.AsyncClient,
    ruta: str,
    cuerpo: dict[str, Any],
    modelo: str,
    espera: float,
    maximo: int,
) -> Any | JSONResponse:
    """Llama a Ollama y devuelve su JSON, o la respuesta de error que corresponde."""
    contenido = bytearray()
    try:
        async with cliente.stream("POST", ruta, json=cuerpo, timeout=espera) as respuesta:
            estado = respuesta.status_code
            if estado == 200:
                async for parte in respuesta.aiter_bytes():
                    contenido += parte
                    if len(contenido) > maximo:
                        registro.warning("Ollama devolvió una respuesta demasiado grande")
                        return error(502, "Ollama devolvió una respuesta demasiado grande")
    except httpx.TimeoutException:
        registro.warning("Ollama no respondió a tiempo en %s", ruta)
        return error(503, "Ollama no respondió a tiempo, puedes volver a intentarlo")
    except httpx.HTTPError:
        registro.warning("No hay conexión con Ollama en %s", ruta)
        return error(503, "No hay conexión con Ollama, revisa que esté abierto")
    if estado == 404:
        registro.warning("Ollama no tiene el modelo %s", modelo)
        return error(503, f"Ollama no tiene el modelo {modelo}, ejecuta ollama pull {modelo}")
    if estado == 400:
        # Por ejemplo un texto más largo que el contexto del modelo, reintentar no sirve.
        registro.warning("Ollama rechazó la solicitud en %s", ruta)
        return error(
            422, "Ollama rechazó la solicitud, por ejemplo por superar el largo del modelo"
        )
    if estado != 200:
        registro.warning("Ollama respondió con el estado %d en %s", estado, ruta)
        return error(502, "Ollama respondió con un error")
    try:
        return json.loads(contenido)
    except ValueError:
        registro.warning("Ollama no devolvió JSON en %s", ruta)
        return error(502, "Ollama no devolvió una respuesta válida")


def crear_aplicacion(
    configuracion: Configuracion, transporte: httpx.AsyncBaseTransport | None = None
) -> FastAPI:
    @asynccontextmanager
    async def ciclo(app: FastAPI):
        async with httpx.AsyncClient(
            base_url=configuracion.ollama_url,
            timeout=httpx.Timeout(ESPERA_OLLAMA, connect=5.0),
            follow_redirects=False,
            trust_env=False,
            transport=transporte,
        ) as cliente:
            app.state.ollama = cliente
            yield

    app = FastAPI(title="CONVI IA", docs_url=None, redoc_url=None, openapi_url=None, lifespan=ciclo)
    app.add_exception_handler(RequestValidationError, solicitud_invalida)
    app.add_middleware(ProteccionRutas, token=configuracion.token)

    @app.post(RUTA_EMBED)
    async def embed(solicitud: SolicitudEmbeddings, request: Request) -> JSONResponse:
        inicio = time.perf_counter()
        datos = await llamar_ollama(
            request.app.state.ollama,
            "/api/embed",
            {"model": MODELO_EMBEDDING, "input": solicitud.input, "truncate": False},
            MODELO_EMBEDDING,
            ESPERA_OLLAMA,
            MAXIMO_RESPUESTA_OLLAMA,
        )
        if isinstance(datos, JSONResponse):
            return datos
        vectores = vectores_validos(datos, len(solicitud.input))
        if vectores is None:
            registro.warning("Ollama devolvió vectores que no cumplen el contrato")
            return error(
                502, f"Ollama no devolvió {DIMENSIONES_EMBEDDING} valores válidos por texto"
            )
        registro.info(
            "Embeddings listos: %d textos en %.0f ms",
            len(vectores),
            (time.perf_counter() - inicio) * 1000,
        )
        return JSONResponse({"model": MODELO_EMBEDDING, "embeddings": vectores})

    @app.post(RUTA_CHAT)
    async def chat(solicitud: SolicitudChat, request: Request) -> JSONResponse:
        inicio = time.perf_counter()
        # El servicio fija lo que no se negocia: sin razonamiento visible, temperatura 0 para
        # que responda siempre igual a lo mismo, y el modelo cargado un rato más.
        datos = await llamar_ollama(
            request.app.state.ollama,
            "/api/chat",
            {
                "model": MODELO_GENERACION,
                "messages": [m.model_dump() for m in solicitud.messages],
                "format": solicitud.format,
                "stream": False,
                "think": False,
                "keep_alive": MANTENER_CARGADO,
                "options": {"temperature": 0, "num_ctx": 8192},
            },
            MODELO_GENERACION,
            ESPERA_GENERACION,
            MAXIMO_RESPUESTA_OLLAMA,
        )
        if isinstance(datos, JSONResponse):
            return datos
        mensaje = datos.get("message") if isinstance(datos, dict) else None
        contenido = mensaje.get("content") if isinstance(mensaje, dict) else None
        if not isinstance(contenido, str) or not contenido.strip():
            registro.warning("Ollama no devolvió el texto de la respuesta")
            return error(502, "Ollama no devolvió una respuesta")
        if len(contenido) > MAXIMO_RESPUESTA_GENERACION:
            registro.warning("La respuesta del modelo es demasiado larga")
            return error(502, "La respuesta del modelo es demasiado larga")
        registro.info(
            "Respuesta lista: %d mensajes en %.0f ms",
            len(solicitud.messages),
            (time.perf_counter() - inicio) * 1000,
        )
        return JSONResponse(
            {"model": MODELO_GENERACION, "message": {"role": "assistant", "content": contenido}}
        )

    @app.get("/salud")
    async def salud(request: Request) -> JSONResponse:
        cliente: httpx.AsyncClient = request.app.state.ollama
        estados: dict[str, bool | str] = {}
        for modelo in (MODELO_EMBEDDING, MODELO_GENERACION):
            try:
                respuesta = await cliente.post("/api/show", json={"model": modelo}, timeout=5.0)
            except httpx.HTTPError:
                return JSONResponse(
                    {"servicio": "ok", "ollama": "sin respuesta", "modelo": MODELO_EMBEDDING},
                    status_code=503,
                )
            if respuesta.status_code == 200:
                estados[modelo] = True
            elif respuesta.status_code == 404:
                estados[modelo] = falta(modelo)
            else:
                return JSONResponse(
                    {"servicio": "ok", "ollama": "error", "modelo": MODELO_EMBEDDING},
                    status_code=503,
                )
        listo = all(valor is True for valor in estados.values())
        return JSONResponse(
            {
                "servicio": "ok",
                "ollama": "ok",
                "modelo": MODELO_EMBEDDING,
                "instalado": estados[MODELO_EMBEDDING],
                "generacion": {
                    "modelo": MODELO_GENERACION,
                    "instalado": estados[MODELO_GENERACION],
                },
            },
            status_code=200 if listo else 503,
        )

    return app
