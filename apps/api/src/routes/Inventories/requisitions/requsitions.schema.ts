import { idSchema, intSchema, absoluteNumberSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';

export const movementsFilterSchema = z.object({
  code: z.string().nullable(),
  programation: intSchema,
  jobpo: z.string().nullable(),
});

export const jobsSchema = z.object({
  code: z.string(),
});

export const requisitionSchema = z.object({
  petitioner: z.string(),
  motive: z.string(),
  areaId: idSchema,
  code: z.string(),
  // Obs 20-Nov (Juan): cantidad requerida POR ORDEN. `items` es lo nuevo;
  // requested + jobIds se aceptan aún por si un navegador trae el bundle viejo
  // (reparto FIFO de siempre).
  items: z
    .array(
      z.object({
        id: z.coerce.number().int(),
        amount: absoluteNumberSchema,
      }),
    )
    .optional(),
  requested: absoluteNumberSchema.optional(),
  jobIds: z
    .array(z.coerce.string())
    .transform((v) => v.map((vv) => Number(vv)))
    .optional(),
});

export const suppliesSchema = z.object({
  petitioner: z.string(),
  motive: z.string(),
  areaId: idSchema,
  job: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val?.includes(','), 'El job no puede contener comas'),
  materials: z.array(
    z.object({
      code: z.string(),
      amount: absoluteNumberSchema,
    }),
  ),
});
