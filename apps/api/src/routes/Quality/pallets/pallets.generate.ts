import puppeteer from 'puppeteer';
import Mustache from 'mustache';
import path from 'path';
import { promises as fs } from 'fs';
import { format } from 'date-fns';

const TEMPLATES = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'static',
  'templates',
);

async function renderPdf(html: string, landscape: boolean) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
    executablePath:
      process.env.NODE_ENV === 'production' ? '/usr/bin/google-chrome' : undefined,
  });
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({
    format: 'letter',
    landscape,
    printBackground: true,
    margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
  });
  await browser.close();
  return pdf;
}

async function getLogo() {
  const logo = await fs.readFile(
    path.join(TEMPLATES, 'ie', 'cstgroup.png'),
  );
  return `data:image/png;base64,${logo.toString('base64')}`;
}

export async function generatePalletLabelPdf(pallet: {
  folio: number;
  client: string;
  contents: { ref: string; part: string; description: string; amount: number }[];
}) {
  const template = await fs.readFile(
    path.join(TEMPLATES, 'quality', 'pallet-label.html'),
    'utf-8',
  );

  const html = Mustache.render(template, {
    logo: await getLogo(),
    client: pallet.client,
    folio: pallet.folio,
    contents: pallet.contents || [],
  });

  return renderPdf(html, true);
}

export async function generateExportOrderPdf(
  order: { id: number; date: Date; client: string },
  pallets: {
    folio: number;
    contents: {
      ref: string;
      part: string;
      description: string;
      amount: number;
      boxes: number;
    }[];
  }[],
  opts: { title?: string; packSlip?: string } = {},
) {
  const template = await fs.readFile(
    path.join(TEMPLATES, 'quality', 'export-order.html'),
    'utf-8',
  );

  const rows: any[] = [];
  let totalPieces = 0;
  let totalBoxes = 0;

  for (const pallet of pallets) {
    (pallet.contents || []).forEach((content, i) => {
      rows.push({
        folio: i === 0 ? pallet.folio : '',
        ref: content.ref,
        part: content.part,
        description: content.description,
        boxes: content.boxes,
        amount: content.amount,
      });
      totalPieces += content.amount;
      totalBoxes += content.boxes;
    });
  }

  const html = Mustache.render(template, {
    logo: await getLogo(),
    title: opts.title || 'ORDEN DE EXPORTACIÓN',
    packSlip: opts.packSlip || null,
    date: format(order.date, 'dd-MMM'),
    client: order.client,
    rows,
    totalPieces,
    totalBoxes,
    totalPallets: pallets.length,
  });

  return renderPdf(html, false);
}
