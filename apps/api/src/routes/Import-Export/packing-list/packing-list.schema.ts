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

// PL de inventario (obs 04/08): materia prima o subproducto directo del
// inventario, sin jobs/pallets. Un solo tipo por PL; jobs/SO/PO van vacíos.
export const createInventoryPlSchema = z.object({
  plType: z.enum(['materiaPrima', 'subproducto']),
  lines: z
    .array(
      z.object({
        materialId: intSchema,
        amount: z.number().positive(),
        boxes: z.number().int().nullish(),
      }),
    )
    .min(1, 'Selecciona al menos un material'),
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

// Modificar los datos de un PL existente (obs 04/08): edita el snapshot que
// usa el PDF. Todos los campos opcionales — solo se actualiza lo enviado.
const addressSchema = z.object({
  name: z.string().nullish(),
  direction: z.string().nullish(),
  rfc: z.string().nullish(),
});
export const updatePlDataSchema = z.object({
  id: idSchema,
  shipDate: z.string().nullish(),
  shipVia: z.string().nullish(),
  consignee: z.string().nullish(),
  blNo: z.string().nullish(),
  trk: z.string().nullish(),
  po: z.string().nullish(),
  invoice: z.string().nullish(),
  weight: z.string().nullish(),
  carrierExp: z.string().nullish(),
  exported: addressSchema.nullish(),
  soldTo: addressSchema.nullish(),
  destination: addressSchema.nullish(),
  totalBoxes: z.number().int().nullish(),
  totalPallets: z.number().nullish(),
  orders: z.array(z.object({ boxes: z.number().int().nullish() })).nullish(),
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
