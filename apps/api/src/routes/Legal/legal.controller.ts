import { Controller, Get, Header } from '@nestjs/common';

// Páginas PÚBLICAS para el registro de la app de QuickBooks con Intuit.
// SIN AuthGuard a propósito: el crawler de Intuit las fetchea sin sesión y
// rechaza las production keys si contestan 302/401. Las URLs quedan registradas
// en el perfil de la app de Intuit — NO moverlas ni renombrarlas.
// Entidad: CST Group Inc. (los libros de la empresa; no ZenPet, no Consulting).

const APP_NAME = 'CST Group QuickBooks Connector';
const CONTACT = 'alerts@cstgrp.com';
const COMPANY = 'CST Group Inc.';
const ADDRESS = '2364 Paseo de las Americas, Suite 104-1009, San Diego, CA 92154, USA';
const UPDATED = 'September 8, 2026';

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ${COMPANY}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; background: #f7f7f7; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; background: #fff; min-height: 100vh; box-sizing: border-box; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; }
  p, li { line-height: 1.6; font-size: 15px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #666; }
  a { color: #0b5cad; }
</style>
</head>
<body>
<main>
${body}
<footer>
  <p>${COMPANY} · ${ADDRESS}<br />
  Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
  <p><a href="/legal/qbo-app">About the app</a> · <a href="/legal/privacy">Privacy Policy</a> · <a href="/legal/eula">End User License Agreement</a></p>
</footer>
</main>
</body>
</html>`;
}

@Controller('legal')
export class LegalController {
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  privacy() {
    return page(
      'Privacy Policy',
      `
<h1>Privacy Policy</h1>
<p class="meta">${APP_NAME} · Last updated: ${UPDATED}</p>

<p>This Privacy Policy describes how ${COMPANY} ("we", "us") handles data in connection
with the ${APP_NAME} (the "App"), an internal application that connects to the
QuickBooks Online account of ${COMPANY} through Intuit's official APIs.</p>

<h2>1. What data the App accesses</h2>
<p>With the authorization of the QuickBooks account administrator, the App accesses the
following data from QuickBooks Online: <b>invoices, customers, and products/items</b>.
The App does not access payroll, banking credentials, or employee data.</p>

<h2>2. What the data is used for</h2>
<p>The data is used exclusively to support ${COMPANY}'s own bookkeeping and billing
operations: reading existing invoices and generating <b>draft</b> documents for review
by our accounting staff. The App serves a single company (our own); it is not offered
to the public and does not process data on behalf of other businesses or consumers.</p>

<h2>3. Where the data is stored and how it is protected</h2>
<p>Data retrieved from QuickBooks is processed and stored on servers controlled by
${COMPANY}. All communication with Intuit's APIs uses TLS (HTTPS). OAuth access tokens
are stored encrypted, are never exposed in client-side code, and access to the servers
is restricted to authorized personnel. We follow the principle of least privilege: the
App only requests the QuickBooks scopes it needs.</p>

<h2>4. Sharing with third parties</h2>
<p><b>We do not sell, rent, or share QuickBooks data with third parties.</b> Data is not
used for advertising or profiling of any kind.</p>

<h2>5. Data retention</h2>
<p>Working copies of QuickBooks data are retained only as long as needed for the
bookkeeping task at hand and for our internal record-keeping obligations, and are
deleted or refreshed on each synchronization. Upon disconnection of the App (see
below), stored QuickBooks data is deleted within 30 days, except where retention is
required by law or legitimate accounting records.</p>

<h2>6. Revoking access</h2>
<p>The QuickBooks administrator can revoke the App's access at any time from Intuit's
connected-apps panel (QuickBooks Online &rarr; Settings &rarr; Apps), or by contacting
us at <a href="mailto:${CONTACT}">${CONTACT}</a>. Revoking access invalidates the App's
tokens immediately.</p>

<h2>7. Changes to this policy</h2>
<p>If we change this policy we will update this page and its "Last updated" date. The
URL of this page is permanent.</p>

<h2>8. Contact</h2>
<p>${COMPANY}, ${ADDRESS}. Email: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
`,
    );
  }

  @Get('eula')
  @Header('Content-Type', 'text/html; charset=utf-8')
  eula() {
    return page(
      'End User License Agreement',
      `
<h1>End User License Agreement (EULA)</h1>
<p class="meta">${APP_NAME} · Last updated: ${UPDATED}</p>

<h2>1. The application</h2>
<p>The ${APP_NAME} (the "App") is an internal software application owned and operated
by ${COMPANY} that connects to QuickBooks Online to read invoices, customers, and
products, and to generate draft documents for ${COMPANY}'s own bookkeeping.</p>

<h2>2. License and permitted use</h2>
<p>Use of the App is limited to authorized personnel of ${COMPANY}. ${COMPANY} grants
its authorized users a limited, non-exclusive, non-transferable, revocable license to
use the App for internal business purposes only.</p>

<h2>3. No affiliation with Intuit</h2>
<p>The App is developed and operated by ${COMPANY} and <b>is not affiliated with,
endorsed by, or sponsored by Intuit Inc.</b> QuickBooks and QuickBooks Online are
trademarks of Intuit Inc., used here only to identify the service the App connects to.</p>

<h2>4. No warranties</h2>
<p>THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. ${COMPANY.toUpperCase()} DOES
NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED OR ERROR-FREE.</p>

<h2>5. Limitation of liability</h2>
<p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY.toUpperCase()} SHALL NOT BE LIABLE
FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY
LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO THE USE
OF THE APP. IN ALL CASES, TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED ONE HUNDRED US
DOLLARS (USD $100).</p>

<h2>6. Termination</h2>
<p>${COMPANY} may suspend or terminate access to the App at any time. Upon termination,
the license granted here ends immediately and the App's connection to QuickBooks may be
revoked. Sections 3, 4, and 5 survive termination.</p>

<h2>7. Governing law</h2>
<p>This agreement is governed by the laws of the State of California, USA, without
regard to conflict-of-law principles.</p>

<h2>8. Contact</h2>
<p>Questions about these terms: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
`,
    );
  }

  @Get('qbo-app')
  @Header('Content-Type', 'text/html; charset=utf-8')
  qboApp() {
    return page(
      APP_NAME,
      `
<h1>${APP_NAME}</h1>
<p class="meta">by ${COMPANY} · Updated: ${UPDATED}</p>

<p>The ${APP_NAME} is an internal application of ${COMPANY} that connects to our
company's QuickBooks Online account to <b>read invoices and generate draft
documents</b> for review by our accounting staff.</p>

<p>It is a single-company tool for ${COMPANY}'s own books: it is not distributed to
the public, does not serve other businesses, and does not share QuickBooks data with
third parties. See our <a href="/legal/privacy">Privacy Policy</a> and
<a href="/legal/eula">EULA</a>.</p>

<h2>Contact</h2>
<p>${COMPANY} · ${ADDRESS}<br />
<a href="mailto:${CONTACT}">${CONTACT}</a></p>
`,
    );
  }
}
