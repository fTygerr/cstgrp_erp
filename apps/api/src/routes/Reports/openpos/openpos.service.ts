import { Injectable } from '@nestjs/common';
import exceljs from 'exceljs';
import { z } from 'zod/v4';
import { getOpenPoLines, getOpenPoSummary } from 'src/utils/openpos';
import { openPosFilterSchema } from './openpos.schema';

// Reportes → PO Abiertos (Hector/Juan 11-Sep-2026). Fórmulas en utils/openpos.ts
@Injectable()
export class OpenPosService {
  async get(query: z.infer<typeof openPosFilterSchema>) {
    const onlyOpen = query.onlyOpen !== 'false';
    const [summary, lines] = await Promise.all([
      getOpenPoSummary(query.clientId || undefined, onlyOpen),
      getOpenPoLines(query.clientId || undefined, false),
    ]);
    const pos = new Set(summary.map((s) => s.po + '|' + s.clientId));
    return {
      summary,
      lines: lines.filter((l) => pos.has(l.po + '|' + l.clientId)),
    };
  }

  async excel(query: z.infer<typeof openPosFilterSchema>) {
    const { summary, lines } = await this.get(query);
    const wb = new exceljs.Workbook();
    const d = (v: any) => (v ? new Date(v) : null);

    const s1 = wb.addWorksheet('Resumen por PO');
    s1.columns = [
      { header: 'Cliente', key: 'client', width: 12 },
      { header: 'PO', key: 'po', width: 10 },
      { header: 'Líneas', key: 'lines', width: 8 },
      { header: 'Capturado en ERP', key: 'entered', width: 17 },
      { header: 'Fecha entrega', key: 'due', width: 14 },
      { header: 'Pedido (pz)', key: 'ordered', width: 12 },
      { header: 'Embarcado (pz)', key: 'shipped', width: 14 },
      { header: 'En PL sin salir (pz)', key: 'inPl', width: 18 },
      { header: 'Abierto (pz)', key: 'open', width: 12 },
      { header: 'Liberado (pz)', key: 'released', width: 13 },
      { header: 'Último embarque', key: 'lastShip', width: 16 },
      { header: 'Estatus', key: 'status', width: 12 },
    ];
    summary.forEach((r) =>
      s1.addRow({ ...r, entered: d(r.entered), due: d(r.due), lastShip: d(r.lastShip) }),
    );

    const s2 = wb.addWorksheet('Detalle por línea');
    s2.columns = [
      { header: 'Cliente', key: 'client', width: 12 },
      { header: 'PO', key: 'po', width: 10 },
      { header: 'Job / línea', key: 'job', width: 12 },
      { header: 'No. parte', key: 'part', width: 14 },
      { header: 'Descripción', key: 'description', width: 34 },
      { header: 'Capturado en ERP', key: 'entered', width: 17 },
      { header: 'Fecha entrega', key: 'due', width: 14 },
      { header: 'Pedido (pz)', key: 'ordered', width: 12 },
      { header: 'Embarcado (pz)', key: 'shipped', width: 14 },
      { header: 'En PL sin salir (pz)', key: 'inPl', width: 18 },
      { header: 'Abierto (pz)', key: 'open', width: 12 },
      { header: 'Liberado (pz)', key: 'released', width: 13 },
      { header: 'Embarques (pack slip: pz (fecha))', key: 'shipments', width: 60 },
    ];
    lines.forEach((r) => s2.addRow({ ...r, entered: d(r.entered), due: d(r.due) }));

    for (const ws of [s1, s2]) {
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ['entered', 'due', 'lastShip'].forEach((k) => {
        try {
          ws.getColumn(k).numFmt = 'dd-mmm-yyyy';
        } catch {}
      });
    }
    return wb.xlsx.writeBuffer();
  }
}
