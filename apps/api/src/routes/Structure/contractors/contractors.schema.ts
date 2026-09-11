import { idSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';

export const createSchema = z.object({
  name: z.string(),
  active: z.boolean(),
  // IVA en el PDF de pagos (obs 02/09; Juan 11/09: tasa por contratista —
  // 0 = sin IVA, 8 o 16). `iva` (booleano) se mantiene en sincronía = tasa > 0.
  ivaRate: z.coerce.number().refine((v) => [0, 8, 16].includes(v), 'IVA invalido').default(0),
  iva: z.boolean().optional(),
});

export const editSchema = createSchema.extend({
  id: idSchema,
});

export const deleteSchema = z.object({
  id: idSchema,
});
