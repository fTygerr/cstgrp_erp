import { idSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';

export const createSchema = z.object({
  name: z.string(),
  active: z.boolean(),
  // IVA 16% en el PDF de pagos, solo para quien lo tenga habilitado (obs 02/09)
  iva: z.boolean().default(false),
});

export const editSchema = createSchema.extend({
  id: idSchema,
});

export const deleteSchema = z.object({
  id: idSchema,
});
