import { z } from 'zod/v4';

export const getExportSchema = z.object({
  job: z.string().nullish(),
  part: z.string().nullish(),
  clientId: z.string().nullish(),
  // folio de orden de exportación: muestra solo sus pallets (obs 03/09 p.4)
  exportOrder: z.string().nullish(),
});

export const getInventoryExportSchema = z.object({
  type: z.enum(['materiaPrima', 'subproducto']),
  code: z.string().nullish(),
  clientId: z.string().nullish(),
});
