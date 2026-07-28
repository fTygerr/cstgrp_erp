import { z } from 'zod/v4';
import { idSchema } from 'src/utils/schemas';

export const palletJobsFilterSchema = z.object({
  job: z.string().nullable(),
  programation: z.string().nullable(),
  pending: z.string().nullable(),
});

export const palletsFilterSchema = z.object({
  folio: z.string().nullable(),
  clientId: z.string().nullable(),
  pending: z.string().nullable(),
});

export const createPalletsSchema = z.object({
  jobId: idSchema,
  rows: z
    .array(
      z.object({
        amount: z.coerce.number().int().min(1, 'Cantidad invalida'),
        boxes: z.coerce.number().int().min(0, 'Cajas invalidas'),
        combineFolio: z.coerce.number().int().min(1).nullish(),
      }),
    )
    .nonempty('Agrega al menos un pallet')
    .max(30),
});

export const updateContentSchema = z.object({
  id: idSchema,
  amount: z.coerce.number().int().min(1, 'Cantidad invalida'),
  boxes: z.coerce.number().int().min(0, 'Cajas invalidas'),
});

export const createExportOrderSchema = z.object({
  palletIds: z.array(idSchema).nonempty('Selecciona al menos un pallet'),
});

export const exportOrdersFilterSchema = z.object({
  id: z.string().nullable(),
});
