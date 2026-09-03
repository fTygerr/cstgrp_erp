-- Seed release obs 2-Sept: Juan marcó CRISTOBAL con IVA en app2;
-- se replica igual en prod (los demás contratistas quedan sin IVA).
-- (en prod el nombre completo es CRISTOBAL ASCOLANI)
UPDATE contractors SET iva = true WHERE name LIKE 'CRISTOBAL%';
