const sharp = require('sharp');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatInvoiceAmount(amount, currency = 'USDC') {
  const num = Number(amount);
  if (!Number.isFinite(num)) return `0 ${currency}`;
  if (Number.isInteger(num)) return `${num.toLocaleString()} ${currency}`;
  return `${num.toFixed(2)} ${currency}`;
}

function wrapText(text, maxChars = 48) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) { lines.push(current); current = word; }
    else { current = next; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function splitAddress(address, maxLen = 26) {
  const value = String(address || '');
  if (value.length <= maxLen) return [value];
  const mid = Math.ceil(value.length / 2);
  return [value.slice(0, mid), value.slice(mid)];
}

/**
 * Render a full professional invoice image (PNG) via SVG → sharp.
 *
 * @param {object} invoiceData
 *   businessName, businessEmail, businessAddress, businessPhone?,
 *   customerName, customerEmail?,
 *   amount, taxAmount?, totalAmount?,
 *   currency, invoiceId, dueDate, itemDescription?,
 *   depositAddress, cryptoChain?, cryptoToken?,
 *   fiatAccountNumber?, fiatBankName?, fiatBeneficiary?, fiatCurrency?,
 *   paymentLink?
 */
async function renderInvoiceImage(invoiceData) {
  const {
    businessName    = 'PayIT Business',
    businessEmail   = '',
    businessAddress = '',
    businessPhone   = '',
    customerName    = 'Client',
    customerEmail   = '',
    amount          = 0,
    taxAmount       = 0,
    totalAmount,
    currency        = 'NGN',
    invoiceId       = 'INV-000000',
    dueDate         = '',
    itemDescription = 'Professional Services',
    depositAddress  = '',
    cryptoChain     = 'Arbitrum One',
    cryptoToken     = 'USDT/USDC',
    fiatAccountNumber = '',
    fiatBankName    = '',
    fiatBeneficiary = '',
    fiatCurrency    = '',
    paymentLink     = '',
  } = invoiceData;

  const computedTotal = totalAmount ?? (Number(amount) + Number(taxAmount));
  const amountLabel   = formatInvoiceAmount(amount, currency);
  const totalLabel    = formatInvoiceAmount(computedTotal, currency);
  const hasTax        = Number(taxAmount) > 0;

  const addressLines       = splitAddress(depositAddress, 26);
  const bizAddressLines    = wrapText(businessAddress, 44).slice(0, 2);
  const descLines          = wrapText(itemDescription, 48).slice(0, 2);

  // ── Heights ──────────────────────────────────────────────────────────
  const H = 1380;
  const W = 1024;

  // ── Colour palette ───────────────────────────────────────────────────
  const BRAND   = '#047857'; // forest green
  const BRAND_L = '#ECFDF5'; // mint
  const NAVY    = '#0F172A'; // ink
  const MID     = '#374151'; // body text
  const MUTED   = '#6B7280'; // muted
  const RULE    = '#E5E7EB'; // divider
  const WHITE   = '#FFFFFF';
  const GOLD    = '#F59E0B'; // amber for network badge

  const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#065F46"/>
    </linearGradient>
    <linearGradient id="cryptoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E3A5F"/>
    </linearGradient>
    <style>
      text { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; }
      .mono { font-family: 'Courier New', monospace; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#F8FAFC"/>

  <!-- Green header band -->
  <rect x="0" y="0" width="${W}" height="190" fill="url(#headerGrad)"/>

  <!-- INVOICE title -->
  <text x="60" y="72" font-size="48" font-weight="800" fill="${WHITE}" letter-spacing="6">INVOICE</text>
  <text x="60" y="106" font-size="20" fill="rgba(255,255,255,0.80)">${escapeXml(businessName)}</text>
  ${businessEmail ? `<text x="60" y="132" font-size="16" fill="rgba(255,255,255,0.65)">${escapeXml(businessEmail)}</text>` : ''}
  ${businessPhone ? `<text x="60" y="154" font-size="15" fill="rgba(255,255,255,0.60)">${escapeXml(businessPhone)}</text>` : ''}

  <!-- Invoice ID badge top-right -->
  <rect x="680" y="22" width="290" height="42" rx="8" fill="rgba(255,255,255,0.15)"/>
  <text x="825" y="47" font-size="14" font-weight="700" fill="${WHITE}" text-anchor="middle">${escapeXml(invoiceId)}</text>
  <text x="825" y="67" font-size="12" fill="rgba(255,255,255,0.70)" text-anchor="middle">Issued ${escapeXml(dateStr)}</text>

  <!-- White card body -->
  <rect x="40" y="170" width="${W - 80}" height="${H - 210}" rx="20" fill="${WHITE}" filter="drop-shadow(0 4px 20px rgba(0,0,0,0.06))"/>

  <!-- ── BILL TO + INVOICE META ── y=210 -->
  <!-- Bill To -->
  <text x="72" y="218" font-size="11" font-weight="700" fill="${BRAND}" letter-spacing="1.5">BILL TO</text>
  <text x="72" y="244" font-size="18" font-weight="700" fill="${NAVY}">${escapeXml(customerName)}</text>
  ${customerEmail ? `<text x="72" y="268" font-size="14" fill="${MUTED}">${escapeXml(customerEmail)}</text>` : ''}

  <!-- Right meta: Due Date + Business Address -->
  <text x="660" y="218" font-size="11" font-weight="700" fill="${BRAND}" letter-spacing="1.5">DUE DATE</text>
  <text x="660" y="244" font-size="18" font-weight="700" fill="${NAVY}">${escapeXml(dueDate)}</text>
  ${bizAddressLines.map((l, i) => `<text x="660" y="${270 + i * 20}" font-size="13" fill="${MUTED}">${escapeXml(l)}</text>`).join('\n  ')}

  <!-- Divider -->
  <line x1="60" y1="300" x2="${W - 60}" y2="300" stroke="${RULE}" stroke-width="1.5"/>

  <!-- ── LINE ITEM TABLE HEADER ── y=330 -->
  <rect x="60" y="310" width="${W - 120}" height="36" rx="8" fill="${BRAND_L}"/>
  <text x="80" y="334" font-size="13" font-weight="700" fill="${BRAND}">DESCRIPTION</text>
  <text x="${W - 100}" y="334" font-size="13" font-weight="700" fill="${BRAND}" text-anchor="end">AMOUNT</text>

  <!-- Line item row -->
  ${descLines.map((l, i) => `<text x="80" y="${366 + i * 22}" font-size="15" fill="${MID}">${escapeXml(l)}</text>`).join('\n  ')}
  <text x="${W - 80}" y="366" font-size="15" font-weight="600" fill="${NAVY}" text-anchor="end">${escapeXml(amountLabel)}</text>

  <!-- Sub-total / Tax / Total block -->
  <line x1="${W - 320}" y1="410" x2="${W - 60}" y2="410" stroke="${RULE}" stroke-width="1"/>
  <text x="${W - 320}" y="435" font-size="14" fill="${MUTED}">Subtotal</text>
  <text x="${W - 80}" y="435" font-size="14" fill="${MID}" text-anchor="end">${escapeXml(amountLabel)}</text>
  ${hasTax ? `
  <text x="${W - 320}" y="460" font-size="14" fill="${MUTED}">VAT (7.5%)</text>
  <text x="${W - 80}" y="460" font-size="14" fill="${MID}" text-anchor="end">${escapeXml(formatInvoiceAmount(taxAmount, currency))}</text>
  ` : ''}
  <line x1="${W - 320}" y1="${hasTax ? 474 : 449}" x2="${W - 60}" y2="${hasTax ? 474 : 449}" stroke="${RULE}" stroke-width="1"/>
  <!-- Total -->
  <rect x="${W - 320}" y="${hasTax ? 482 : 457}" width="260" height="44" rx="10" fill="${BRAND_L}"/>
  <text x="${W - 300}" y="${hasTax ? 510 : 485}" font-size="15" font-weight="700" fill="${BRAND}">TOTAL DUE</text>
  <text x="${W - 80}" y="${hasTax ? 510 : 485}" font-size="18" font-weight="800" fill="${BRAND}" text-anchor="end">${escapeXml(totalLabel)}</text>

  <!-- ── PAYMENT RAILS ── start y=545 -->
  <text x="72" y="${hasTax ? 556 : 530}" font-size="14" font-weight="800" fill="${NAVY}" letter-spacing="0.5">PAYMENT INSTRUCTIONS</text>
  <line x1="60" y1="${hasTax ? 564 : 540}" x2="${W - 60}" y2="${hasTax ? 564 : 540}" stroke="${RULE}" stroke-width="1.5"/>

  <!-- FIAT BANK BOX -->
  ${fiatAccountNumber ? `
  <rect x="60" y="${hasTax ? 578 : 554}" width="${W - 120}" height="140" rx="14" fill="#F0FDF4" stroke="#BBF7D0" stroke-width="1.5"/>
  <text x="82" y="${hasTax ? 604 : 580}" font-size="11" font-weight="700" fill="${BRAND}" letter-spacing="1.5">🏦  BANK TRANSFER (${escapeXml(fiatCurrency || currency)})</text>
  <text x="82" y="${hasTax ? 632 : 608}" font-size="22" font-weight="800" fill="${NAVY}" class="mono">${escapeXml(fiatAccountNumber)}</text>
  <text x="82" y="${hasTax ? 658 : 634}" font-size="14" fill="${MID}">${escapeXml(fiatBankName)}</text>
  <text x="82" y="${hasTax ? 678 : 654}" font-size="13" fill="${MUTED}">Account Name: ${escapeXml(fiatBeneficiary)}</text>
  <text x="82" y="${hasTax ? 704 : 680}" font-size="12" fill="${MUTED}">Send exactly ${escapeXml(totalLabel)} — reference invoice ${escapeXml(invoiceId)}</text>
  ` : `<text x="82" y="${hasTax ? 604 : 580}" font-size="14" fill="${MUTED}">No fiat bank account provisioned for this currency.</text>`}

  <!-- CRYPTO BOX -->
  <rect x="60" y="${hasTax ? 730 : 710}" width="${W - 120}" height="160" rx="14" fill="url(#cryptoGrad)"/>
  <text x="82" y="${hasTax ? 756 : 736}" font-size="11" font-weight="700" fill="rgba(255,255,255,0.65)" letter-spacing="1.5">⛓  CRYPTO / USDT / USDC</text>
  <!-- Chain badge -->
  <rect x="${W - 230}" y="${hasTax ? 740 : 720}" width="170" height="26" rx="6" fill="${GOLD}22" stroke="${GOLD}" stroke-width="1"/>
  <text x="${W - 145}" y="${hasTax ? 757 : 737}" font-size="12" font-weight="700" fill="${GOLD}" text-anchor="middle">${escapeXml(cryptoChain)}</text>

  <text x="82" y="${hasTax ? 788 : 768}" font-size="13" fill="rgba(255,255,255,0.70)">Deposit Address (${escapeXml(cryptoToken)}):</text>
  ${addressLines.map((l, i) => `<text x="82" y="${(hasTax ? 812 : 792) + i * 26}" font-size="16" font-weight="600" fill="#5EEAB0" class="mono">${escapeXml(l)}</text>`).join('\n  ')}
  <text x="82" y="${hasTax ? 874 : 854}" font-size="12" fill="rgba(255,255,255,0.50)">Send USDT or USDC on ${escapeXml(cryptoChain)} only. Do not send other tokens.</text>

  <!-- Payment Link -->
  ${paymentLink ? `
  <text x="72" y="${hasTax ? 920 : 900}" font-size="12" fill="${MUTED}">🌐 Online payment: ${escapeXml(paymentLink.slice(0, 70))}</text>
  ` : ''}

  <!-- ── FOOTER ── -->
  <line x1="60" y1="${H - 72}" x2="${W - 60}" y2="${H - 72}" stroke="${RULE}" stroke-width="1"/>
  <text x="${W / 2}" y="${H - 48}" font-size="13" fill="${MUTED}" text-anchor="middle">Generated by PayIT · ${escapeXml(businessName)}</text>
  <text x="${W / 2}" y="${H - 28}" font-size="11" fill="${RULE}" text-anchor="middle">Please pay the exact amount shown. Partial payments may not be credited.</text>
</svg>`;

  const imageBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return imageBuffer;
}

module.exports = { renderInvoiceImage, formatInvoiceAmount };
