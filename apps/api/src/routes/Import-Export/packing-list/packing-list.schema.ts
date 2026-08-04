import { idSchema, intSchema } from 'src/utils/schemas';
import { z } from 'zod/v4';

export const editPackingListSchema = z.object({
  id: idSchema,
  packSlip: z.string(),
  shipVia: idSchema,
  consignee: idSchema,
  shipDate: z.string(),
  blNo: z.string(),
  trk: z.string(),
  po: z.string(),
  invoice: z.string(),
  weight: z.string(),
  destination: idSchema,
  carrierExp: idSchema,
  shipTo: idSchema,
});

export const applyExportOrderSchema = z.object({
  id: idSchema,
  exportOrderId: idSchema,
});

export const downloadPackingListSchema = z.object({
  id: idSchema,
});

export const previewPackingListSchema = z.object({
  jobIds: z.array(intSchema).min(1, 'Selecciona al menos un job'),
  excludedPalletIds: z.array(intSchema).optional(),
});

export const createPackingListSchema = z.object({
  jobIds: z.array(intSchema).min(1, 'Selecciona al menos un job'),
  excludedPalletIds: z.array(intSchema).optional(),
  shipDate: z.string(),
  shipVia: intSchema.nullish(),
  consignee: intSchema.nullish(),
  blNo: z.string().nullish(),
  trk: z.string().nullish(),
  invoice: z.string().nullish(),
  weight: z.string().nullish(),
  destination: intSchema.nullish(),
  carrierExp: intSchema.nullish(),
  shipTo: intSchema.nullish(),
});

export const getPackingListsSchema = z.object({
  packSlip: z.string().nullish(),
  clientId: z.string().nullish(),
});
