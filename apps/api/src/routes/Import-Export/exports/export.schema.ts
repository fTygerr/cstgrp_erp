import { z } from 'zod/v4';

export const getExportSchema = z.object({
  job: z.string().nullish(),
  part: z.string().nullish(),
  clientId: z.string().nullish(),
});
