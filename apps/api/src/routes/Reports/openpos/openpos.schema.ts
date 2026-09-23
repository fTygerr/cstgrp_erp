import { z } from 'zod/v4';

export const openPosFilterSchema = z.object({
  clientId: z.string().nullish(),
  onlyOpen: z.string().nullish(), // 'true' | 'false'
});
