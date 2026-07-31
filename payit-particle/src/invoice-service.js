const crypto = require('crypto');
const db = require('./db');
const dbPg = require('./db-pg');
const imageGenerator = require('./image-generator');
const customerService = require('./customer-service');
const reminderService = require('./reminder-service');
const fxService = require('./fx-service');
const { formatInvoiceAmount } = require('./invoice-renderer');

async function getPaymentBaseUrl() {
  const authUrl = process.env.AUTH_URL || 'http://localhost:3000/auth';
  try {
    const parsed = new URL(authUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

async function createFullInvoice({ telegramId, user, customer, amount, currency = 'USDC', invoiceId, depositChainKey, depositToken, depositAddress: passedDepositAddress }) {
  const id = invoiceId || `inv_${crypto.randomUUID().slice(0, 8)}`;
  const dueDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const paymentLinkToken = crypto.randomBytes(16).toString('hex');
  
  let depositAddress = passedDepositAddress;
  let depositWalletPrivateKey = null;

  if (!depositAddress) {
    const ethers = require('ethers');
    const hdWallet = ethers.Wallet.createRandom();
    depositAddress = hdWallet.address;
    depositWalletPrivateKey = hdWallet.privateKey;
  }


  const customerId = customerService.upsertCustomer(telegramId, { name: customer });
  customerService.recordInvoiceForCustomer(customerId);

  const fxLock = await fxService.createRateLock(db, {
    userId: telegramId,
    invoiceId: id,
    fromCurrency: currency,
    toCurrency: currency === 'NGN' ? 'USDC' : 'NGN'
  });

  await dbPg.createInvoice(id, telegramId, customer, amount, currency, dueDate, depositAddress, {
    paymentLinkToken,
    fxRate: fxLock.rate,
    fxCurrency: `${currency}/${fxLock.toCurrency}`,
    fxExpiresAt: fxLock.expiresAt,
    customerId,
    reminderEnabled: true,
    depositChain: depositChainKey || null,
    depositToken: depositToken || null,
    depositWalletPrivateKey
  });

  reminderService.scheduleForInvoice(id);

  const paymentLink = `${getPaymentBaseUrl()}/pay/${paymentLinkToken}`;
  const amountLabel = formatInvoiceAmount(amount, currency);
  const ngnEquivalent =
    currency === 'USDC'
      ? ` (~₦${fxService.convert(amount, fxLock.rate, 'USDC', 'NGN').toLocaleString()} at locked rate)`
      : '';

  let invoiceImageBuffer = null;
  try {
    const image = await imageGenerator.generateInvoiceVisual({
      businessName: user.business_name || 'PayIT Business',
      businessEmail: user.business_email || '',
      businessAddress: user.business_address || '',
      customerName: customer,
      amount,
      currency,
      invoiceId: id,
      dueDate,
      depositAddress
    });
    invoiceImageBuffer = image.imageBuffer;
  } catch (e) {
    console.warn('Invoice image generation failed:', e.message);
  }

  return {
    invoiceId: id,
    dueDate,
    amountLabel,
    ngnEquivalent,
    paymentLink,
    fxLock,
    invoiceImageBuffer
  };
}

module.exports = { createFullInvoice, getPaymentBaseUrl };
