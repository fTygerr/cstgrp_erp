import sql from 'src/utils/db';

// PO abiertos (Hector/Juan 11-Sep-2026) — UNA sola consulta compartida por el
// reporte del ERP (Reportes → PO Abiertos) y el feed de ZenPet, para que todos
// vean el mismo número.
//
//   Pedido    = Σ jobs.amount agrupado por jobs.programation (= PO del cliente;
//               cada línea del PO es un job).
//   Embarcado = Σ order_destiny.amount de packing lists con pack slip cuyo
//               estatus ya es embarcado/cruzado/recibido.
//   En PL     = piezas en un PL todavía en estatus 'generado' (no ha salido).
//   Abierto   = Pedido − Embarcado.
//   Liberado  = jobs.calidad + jobs.contractor (listo aunque no haya salido).
//
// Solo se consideran programaciones numéricas (el PO real); las etiquetas por
// mes (AGOSTO, SEPTIEMBRE…) no son PO y se excluyen.

const SHIPPED = sql`d."packSlip" IS NOT NULL AND d.status IN ('embarcado','cruzado','recibido')`;

export async function getOpenPoLines(clientId?: number | string, onlyOpen = false) {
  return sql`
    WITH ship AS (
      SELECT od."orderId",
        SUM(od.amount) FILTER (WHERE ${SHIPPED})::int AS shipped,
        SUM(od.amount) FILTER (WHERE d."packSlip" IS NOT NULL AND d.status = 'generado')::int AS "inPl",
        MAX(d."shipDate") FILTER (WHERE ${SHIPPED}) AS "lastShip",
        string_agg(d."packSlip" || ': ' || od.amount || ' (' || to_char(d."shipDate", 'DD-Mon') || ')', ' | ' ORDER BY d."shipDate")
          FILTER (WHERE ${SHIPPED}) AS shipments
      FROM order_destiny od JOIN destinys d ON d.id = od."destinyId"
      WHERE d."packSlip" IS NOT NULL
      GROUP BY od."orderId")
    SELECT j.programation AS po, j.id AS "jobId", j.ref AS job, j.part, j.description,
      j."clientId", c.name AS client, j.created_at::date AS entered, j.due,
      j.amount::int AS ordered,
      COALESCE(s.shipped, 0)::int AS shipped,
      COALESCE(s."inPl", 0)::int AS "inPl",
      (j.amount - COALESCE(s.shipped, 0))::int AS open,
      (j.calidad + j.contractor)::int AS released,
      s."lastShip", s.shipments
    FROM jobs j JOIN clients c ON c.id = j."clientId"
    LEFT JOIN ship s ON s."orderId" = j.id
    WHERE j.programation ~ '^[0-9]+$'
      ${clientId ? sql`AND j."clientId" = ${clientId}` : sql``}
      ${onlyOpen ? sql`AND (j.amount - COALESCE(s.shipped, 0)) > 0` : sql``}
    ORDER BY j."clientId", j.programation::int DESC, j.part`;
}

export async function getOpenPoSummary(clientId?: number | string, onlyOpen = false) {
  return sql`
    WITH ship AS (
      SELECT od."orderId",
        SUM(od.amount) FILTER (WHERE ${SHIPPED})::int AS shipped,
        SUM(od.amount) FILTER (WHERE d."packSlip" IS NOT NULL AND d.status = 'generado')::int AS "inPl",
        MAX(d."shipDate") FILTER (WHERE ${SHIPPED}) AS "lastShip"
      FROM order_destiny od JOIN destinys d ON d.id = od."destinyId"
      WHERE d."packSlip" IS NOT NULL
      GROUP BY od."orderId"),
    lines AS (
      SELECT j.programation AS po, j."clientId", c.name AS client, j.created_at::date AS entered, j.due,
        j.amount, COALESCE(s.shipped, 0) AS shipped, COALESCE(s."inPl", 0) AS "inPl",
        (j.calidad + j.contractor) AS released, s."lastShip"
      FROM jobs j JOIN clients c ON c.id = j."clientId"
      LEFT JOIN ship s ON s."orderId" = j.id
      WHERE j.programation ~ '^[0-9]+$'
        ${clientId ? sql`AND j."clientId" = ${clientId}` : sql``})
    SELECT po, "clientId", client, COUNT(*)::int AS lines,
      MIN(entered) AS entered, MIN(due) AS due, MAX(due) AS "dueMax",
      SUM(amount)::int AS ordered, SUM(shipped)::int AS shipped, SUM("inPl")::int AS "inPl",
      (SUM(amount) - SUM(shipped))::int AS open, SUM(released)::int AS released,
      MAX("lastShip") AS "lastShip",
      CASE WHEN SUM(amount) - SUM(shipped) <= 0 THEN 'completo'
           WHEN SUM(released) >= SUM(amount) THEN 'liberado'
           WHEN SUM(released) > 0 THEN 'parcial'
           ELSE 'produccion' END AS status
    FROM lines
    GROUP BY po, "clientId", client
    ${onlyOpen ? sql`HAVING SUM(amount) - SUM(shipped) > 0` : sql``}
    ORDER BY "clientId", po::int DESC`;
}
