import postgres from 'postgres';
import { updateMaterialAmount } from 'src/utils/functions';

export const updateContractorAmounts = async (
  id: number,
  sql2: postgres.Sql,
) => {
  const db = sql2;

  await db`UPDATE jobs SET 
  contractor = sub.total,
  "completedContractor" = ("contractorAmount" = sub.total)
  FROM (
    SELECT COALESCE(SUM(accepted), 0) AS total
    FROM contractormovements
    WHERE "orderId" = ${id} AND approved = true
  ) sub
  WHERE id = ${id};`;

  // La fecha del movimiento debe ser la de la ÚLTIMA liberación real, no la de
  // alta de la orden (Juan 06-Oct: una orden liberada sólo por contratistas se
  // quedaba con la fecha en que se capturó la orden). GREATEST ignora NULLs.
  const [updatedMovement] = await db`update materialmovements set 
    "amount" = (select (calidad + contractor) from jobs where id = ${id}),
    "realAmount" = (select (calidad + contractor) from jobs where id = ${id}),
    "activeDate" = COALESCE(
      GREATEST(
        (select max(date) from ordermovements where "progressId" = ${id} and calidad <> 0),
        (select max(date) from contractormovements where "orderId" = ${id} and approved = true)
      ), "activeDate")
    where id = (select "movementId" from jobs where id = ${id}) returning "materialId"`;

  if (updatedMovement)
    await updateMaterialAmount(updatedMovement.materialId, db);
};
