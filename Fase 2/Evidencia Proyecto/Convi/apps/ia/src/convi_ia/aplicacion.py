"""Aplicación FastAPI: POST /api/embed para la API de CONVI y GET /salud para revisar Ollama.

Nunca se registra ni se devuelve el texto de los fragmentos, solo cantidades y tiempos.
"""

import hmac
import json
import logging
import math
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .configuracion import (
    DIMENSIONES_EMBEDDING,
    ESPERA_OLLAMA,
    MAXIMO_CARACTERES,
    MAXIMO_CUERPO,
    MAXIMO_TEXTOS,
    MODELO_EMBEDDING,
    Configuracion,
)

registro = logging.getLogger("convi_ia")

RUTA_EMBED = "/api/embed"
MAXIMO_FLOAT32 = 3.4028234663852886e38
# Ocho vectores de 1024 números ocupan unos 100 KB, el margen cubre los campos extra de Ollama.
MAXIMO_RESPUESTA_OLLAMA = 2 * 1024 * 1024
FALTA_MODELO = f"falta, ejecuta ollama pull {MODELO_EMBEDDING}"


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


class ProteccionEmbed:
    """Revisa el token y el tamaño del cuerpo antes de que FastAPI lea la solicitud."""

    def __init__(self, app: ASGIApp, token: str | None) -> None:
        self.app = app
        self.esperado = f"Bearer {token}".encode() if token else None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] != RUTA_EMBED:
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
        {"detail": "La solicitud no cumple el contrato de embeddings", "errores": detalle},
        status_code=400,
    )


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
    app.add_middleware(ProteccionEmbed, token=configuracion.token)

    @app.post(RUTA_EMBED)
    async def embed(solicitud: SolicitudEmbeddings, request: Request) -> JSONResponse:
        cliente: httpx.AsyncClient = request.app.state.ollama
        inicio = time.perf_counter()
        cuerpo = {"model": MODELO_EMBEDDING, "input": solicitud.input, "truncate": False}
        contenido = bytearray()
        try:
            async with cliente.stream("POST", "/api/embed", json=cuerpo) as respuesta:
                estado = respuesta.status_code
                if estado == 200:
                    async for parte in respuesta.aiter_bytes():
                        contenido += parte
                        if len(contenido) > MAXIMO_RESPUESTA_OLLAMA:
                            registro.warning("Ollama devolvió una respuesta demasiado grande")
                            return error(502, "Ollama devolvió una respuesta demasiado grande")
        except httpx.TimeoutException:
            registro.warning("Ollama no respondió a tiempo con %d textos", len(solicitud.input))
            return error(503, "Ollama no respondió a tiempo, puedes volver a intentarlo")
        except httpx.HTTPError:
            registro.warning("No hay conexión con Ollama en %s", configuracion.ollama_url)
            return error(503, "No hay conexión con Ollama, revisa que esté abierto")
        if estado == 404:
            registro.warning("Ollama no tiene el modelo %s", MODELO_EMBEDDING)
            return error(
                503,
                f"Ollama no tiene el modelo {MODELO_EMBEDDING}, "
                f"ejecuta ollama pull {MODELO_EMBEDDING}",
            )
        if estado == 400:
            # Con truncate en false Ollama rechaza un texto más largo que el contexto del modelo.
            registro.warning("Ollama rechazó %d textos", len(solicitud.input))
            return error(
                422, "Ollama rechazó los textos, por ejemplo por superar el largo del modelo"
            )
        if estado != 200:
            registro.warning("Ollama respondió con el estado %d", estado)
            return error(502, "Ollama respondió con un error")
        try:
            datos = json.loads(contenido)
        except ValueError:
            datos = None
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

    @app.get("/salud")
    async def salud(request: Request) -> JSONResponse:
        cliente: httpx.AsyncClient = request.app.state.ollama
        try:
            respuesta = await cliente.post(
                "/api/show", json={"model": MODELO_EMBEDDING}, timeout=5.0
            )
        except httpx.HTTPError:
            return JSONResponse(
                {"servicio": "ok", "ollama": "sin respuesta", "modelo": MODELO_EMBEDDING},
                status_code=503,
            )
        if respuesta.status_code == 200:
            return JSONResponse(
                {"servicio": "ok", "ollama": "ok", "modelo": MODELO_EMBEDDING, "instalado": True}
            )
        if respuesta.status_code == 404:
            return JSONResponse(
                {
                    "servicio": "ok",
                    "ollama": "ok",
                    "modelo": MODELO_EMBEDDING,
                    "instalado": FALTA_MODELO,
                },
                status_code=503,
            )
        return JSONResponse(
            {"servicio": "ok", "ollama": "error", "modelo": MODELO_EMBEDDING}, status_code=503
        )

    return app
