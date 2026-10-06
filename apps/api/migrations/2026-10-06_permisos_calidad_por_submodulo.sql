-- Permisos de Calidad por submódulo (petición Juan 06-Oct-2026)
--
-- Antes: un solo permiso `quality` cubría Pallets, Pallets Registrados y
-- Exportaciones Registradas. (Liberación ya era independiente: usa
-- `prod_calidad`, que es el único permiso del área 'calidad' y no lo comparte
-- con ninguna otra pantalla — por eso sólo se re-etiqueta en la UI.)
--
-- Después: tres llaves nuevas, cada submódulo con su nivel 0-3.
--   quality_pallets              → Calidad → Pallets (capturar)
--   quality_registered_pallets   → Calidad → Pallets Registrados
--   quality_registered_exports   → Calidad → Exportaciones Registradas
--
-- Cada usuario arranca con EL MISMO nivel que ya tenía en `quality`, así que
-- nadie gana ni pierde acceso con este cambio. `quality` se conserva en la
-- fila (ya no guarda ninguna ruta) para no romper payloads viejos.
--
-- IMPORTANTE: correr ANTES de levantar el backend nuevo. El AuthGuard hace
-- `permissions[llave] >= nivel`, y una llave ausente es undefined → false,
-- o sea 403 en todo Calidad hasta que exista.
--
-- Idempotente: sólo toca a quien aún no tenga las tres llaves.

UPDATE users
SET permissions = permissions
  || jsonb_build_object('quality_pallets',            COALESCE(permissions->>'quality', '0')::int)
  || jsonb_build_object('quality_registered_pallets', COALESCE(permissions->>'quality', '0')::int)
  || jsonb_build_object('quality_registered_exports', COALESCE(permissions->>'quality', '0')::int)
WHERE NOT (permissions ? 'quality_pallets')
   OR NOT (permissions ? 'quality_registered_pallets')
   OR NOT (permissions ? 'quality_registered_exports');
