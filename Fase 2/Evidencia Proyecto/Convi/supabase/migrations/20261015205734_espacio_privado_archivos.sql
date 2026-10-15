-- PB-019 (HU-015 CA2): espacio privado de Storage donde la API guarda los
-- archivos de CONVI (convi.archivos.bucket_id = 'convi-privado'). No es
-- público ni tiene políticas: solo la API, con su clave de servicio, lo lee y
-- escribe. El límite de 25 MB es el mismo de convi.archivos.tamano_bytes.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('convi-privado', 'convi-privado', false, 26214400)
ON CONFLICT (id) DO NOTHING;