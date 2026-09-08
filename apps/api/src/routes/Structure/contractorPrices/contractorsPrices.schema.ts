import { idSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';

// precios de contratista con hasta 8 decimales (Juan 08/09) — las columnas
// contractor_prices.price / exitpass_jobs.price / jobs."contractorPrice" son
// numeric(16,8) desde la migración 2026-09-08
const price8Schema = z.coerce
  .string()
  .regex(/^(?:\d+|\d*\.\d{1,8})$/, 'Numero invalido (máx 8 decimales)');

export const getSchema = z.object({
  contractorId: idSchema,
});

export const createSchema = z.object({
  contractorId: idSchema,
  price: price8Schema,
  part: z.string(),
});

export const editSchema = createSchema.extend({
  id: idSchema,
});

export const deleteSchema = z.object({
  id: idSchema,
});
