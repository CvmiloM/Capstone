"""Servicio de IA de CONVI (PB-079).

Atiende POST /api/embed con el mismo contrato que Ollama, que es el que usa la
API en apps/api/src/modules/documentos/embeddings.ts, y le pasa el trabajo a
Ollama solo después de revisar el token, el modelo y el tamaño de la solicitud.
"""
