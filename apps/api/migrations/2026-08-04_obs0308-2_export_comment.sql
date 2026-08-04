-- Observaciones 03/08 (02) — comentario en la Orden de Exportación (Calidad)
-- Se captura al crear la orden y se imprime en el PDF en el cuadro "Comentarios"
ALTER TABLE exportorders ADD COLUMN IF NOT EXISTS comment text;
