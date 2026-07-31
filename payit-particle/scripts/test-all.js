const assert = require('assert');
const fs = require('fs');
const path = require('path');
const walletManager = require('../src/wallet');
const db = require('../src/db');
const agent = require('../src/agent');
const bot = require('../src/bot');
const invoiceService = require('../src/invoice-service');
const chainConfig = require('../src/chain-config');
const http = require('http');
const { ethers } = require('ethers');

function makePostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(data);
    
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(body)
          });
        } catch (e) {
          reject(new Error('Failed to parse response JSON: ' + body));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting integration tests for PayIT on Particle (Arbitrum Sepolia)...');

  // 1. Test Key Derivation (wallet.js)
  console.log('\nTesting Particle Smart Account Derivation (wallet.js)...');
  const masterWallet = walletManager.generateWallet();
  assert.ok(masterWallet.address, 'Master EOA address should be generated');
  
  const personalSmartAccount = walletManager.deriveSmartAccountAddress(masterWallet.address, 0);
  const businessSmartAccount = walletManager.deriveSmartAccountAddress(masterWallet.address, 1);
  
  assert.notStrictEqual(personalSmartAccount, businessSmartAccount, 'Personal and Business accounts must be distinct');
  assert.ok(ethers.isAddress(personalSmartAccount), 'Derived personal account must be valid EVM address');
  assert.ok(ethers.isAddress(businessSmartAccount), 'Derived business account must be valid EVM address');
  
  console.log(`• EOA Master: ${masterWallet.address}`);
  console.log(`• Personal Smart Account (Index 0): ${personalSmartAccount}`);
  console.log(`• Business Smart Account (Index 1): ${businessSmartAccount}`);
  console.log('✅ Particle Derivation passed!');

  // 2. Test Database Helpers (db.js)
  console.log('\nTesting Database Helpers (db.js)...');
  const tempUserId = 'test_particle_user_' + Date.now();
  db.createUser(tempUserId, personalSmartAccount, businessSmartAccount, 'google');
  
  const fetchedUser = db.getUser(tempUserId);
  assert.ok(fetchedUser, 'User should be fetchable from database');
  assert.strictEqual(fetchedUser.personal_smart_account, personalSmartAccount, 'Personal smart account address should match');
  assert.strictEqual(fetchedUser.business_smart_account, businessSmartAccount, 'Business smart account address should match');
  assert.strictEqual(fetchedUser.active_context, 'personal', 'Initial context should be personal');

  // Business metadata updating
  db.updateBusinessProfile(tempUserId, 'NairaCraft Ltd', 'contact@nairacraft.com');
  const afterBizUser = db.getUser(tempUserId);
  assert.strictEqual(afterBizUser.business_name, 'NairaCraft Ltd', 'Business name should be updated');
  assert.strictEqual(afterBizUser.business_email, 'contact@nairacraft.com', 'Business email should be updated');

  // Test Profile Sync & Link DB Helpers
  const testSyncCode = '849201';
  db.createSyncCode(tempUserId, testSyncCode);
  const fetchedCodeRow = db.getSyncCode(testSyncCode);
  assert.ok(fetchedCodeRow, 'Sync code should be created and fetchable');
  assert.strictEqual(fetchedCodeRow.user_id, tempUserId, 'Sync code user_id should match creator');
  db.markSyncCodeUsed(testSyncCode);
  const usedCodeRow = db.getSyncCode(testSyncCode);
  assert.strictEqual(usedCodeRow, null, 'Used sync code should no longer be valid');

  const linkedTelegramId = '9988776655';
  db.linkTelegramIdToUser(tempUserId, linkedTelegramId);
  const linkedUser = db.getUser(linkedTelegramId);
  assert.ok(linkedUser, 'User should be fetchable via newly linked Telegram ID');
  console.log('✅ Database Helpers passed!');

  // 3. Test chain-aware invoice metadata & Deposit Address Consistency
  console.log('\nTesting chain-aware invoice metadata & deposit address consistency...');
  const testDepositAddr = '0x1234567890123456789012345678901234567890';
  const invoiceMeta = await invoiceService.createFullInvoice({
    telegramId: tempUserId,
    user: {
      business_name: 'Test Merchant',
      business_email: 'merchant@example.com',
      business_address: '1 Test Street'
    },
    customer: 'Chain Tester',
    amount: 24.5,
    currency: 'USDC',
    depositAddress: testDepositAddr,
    invoiceId: `inv_chain_meta_${Date.now()}`,
    depositChainKey: 'arbitrumSepolia',
    depositToken: chainConfig.DEFAULT_CHAIN.usdcAddress
  });
  const storedInvoiceMeta = db.getInvoice(invoiceMeta.invoiceId);
  assert.ok(storedInvoiceMeta, 'Chain-aware invoice should be stored');
  assert.strictEqual(storedInvoiceMeta.deposit_address, testDepositAddr, 'Stored deposit address must match passed deposit address');
  assert.strictEqual(storedInvoiceMeta.deposit_chain, 'arbitrumSepolia', 'Invoice should remember the selected chain');
  assert.strictEqual(storedInvoiceMeta.deposit_token, chainConfig.DEFAULT_CHAIN.usdcAddress.toLowerCase(), 'Invoice should remember the selected token');
  console.log('✅ Deposit Address consistency & metadata passed!');

  // 3a2. Test KYC Duplicate Detection & Unverified Users (db.js)
  console.log('\nTesting KYC/KYB Duplicate Detection & Unverified User Helpers (db.js)...');
  db.updateUserNin(tempUserId, '22334455667');
  const dupCheck = db.findExistingKycUser({ bvn: '22334455667', currentUserId: 'new_user_999' });
  assert.ok(dupCheck, 'findExistingKycUser should detect duplicate BVN/NIN in system');

  const unverifiedList = db.getUnverifiedTelegramUsers();
  assert.ok(Array.isArray(unverifiedList), 'getUnverifiedTelegramUsers should return an array');
  console.log('✅ KYC/KYB Duplicate & Unverified Helpers passed!');

  // 3b. Test System Key Encryption at Rest (db.js & wallet.js)
  console.log('\nTesting System Key Encryption at Rest (wallet.js & db.js)...');
  const samplePrivKey = '0x' + 'a'.repeat(64);
  const testInvId = 'inv_key_test_' + Date.now();
  db.createInvoice(testInvId, tempUserId, 'Key Test Client', 100, 'USDC', '2026-12-31', testDepositAddr, { depositWalletPrivateKey: samplePrivKey });
  const rawRow = db.db.prepare('SELECT deposit_wallet_private_key FROM invoices WHERE invoice_id = ?').get(testInvId);
  assert.ok(rawRow.deposit_wallet_private_key.startsWith('enc_v1:'), 'Stored private key in SQLite must be encrypted at rest');
  const decryptedInvoice = db.getInvoice(testInvId);
  assert.strictEqual(decryptedInvoice.deposit_wallet_private_key, samplePrivKey, 'Decrypted private key must match original');
  console.log('✅ Key Encryption at Rest passed!');

  // 3c. Test FX Service rate getter method
  console.log('\nTesting FX Service rate getter...');
  const fxService = require('../src/fx-service');
  const rate = await fxService.getUsdcNgnRate();
  assert.ok(typeof rate === 'number' && rate > 0, 'FX rate should be a positive number');
  console.log(`• FX Rate: 1 USDC = ${rate} NGN`);
  console.log('✅ FX Service getter passed!');

  // 4. Test HTTP Hook API (server.js)
  console.log('\nTesting OAuth Registration Handler Server & Auth Security (server.js)...');
  const server = require('../src/server');
  const serverPort = 4000;
  await new Promise((resolve) => server.listen(serverPort, resolve));
  console.log(`• Test server listening on port ${serverPort}`);

  const registerPayload = {
    telegramId: 894312,
    personalSmartAccount,
    businessSmartAccount,
    authProvider: 'google'
  };

  try {
    const res = await makePostRequest(`http://localhost:${serverPort}/api/register-wallet`, registerPayload);
    assert.strictEqual(res.statusCode, 200, 'Status should be 200 OK');
    assert.strictEqual(res.body.status, 'success', 'Response status should be success');
    
    // Verify unauthenticated requests to protected endpoints return 401
    const unauthRes = await makePostRequest(`http://localhost:${serverPort}/api/app/send-money`, { amount: 10, recipient: 'Bob' });
    assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated request without telegramId must return 401');

    // Verify mapped data
    const apiUser = db.getUser('894312');
    assert.ok(apiUser, 'User should be registered in database');
    assert.strictEqual(apiUser.personal_smart_account, personalSmartAccount, 'Personal smart account address should match payload');
    assert.strictEqual(apiUser.business_smart_account, businessSmartAccount, 'Business smart account address should match payload');
    console.log('✅ OAuth Registration Handler & Auth Security passed!');
  } finally {
    server.close();
    console.log('• Test server closed.');
  }

  // 5. Test Intent Router (agent.js) - Exact prompts
  console.log('\nTesting Strict JSON Intent Parser (agent.js)...');
  const p2pIntent = await agent.parseIntent('send 5000 NGN to Maria');
  assert.strictEqual(p2pIntent.action, 'P2P_TRANSFER', 'Action should parse as P2P_TRANSFER');
  assert.strictEqual(p2pIntent.parameters.amount, 5000, 'Amount should be 5000');
  assert.strictEqual(p2pIntent.parameters.recipientIdentifier.toLowerCase(), 'maria', 'Recipient should be maria (case-insensitive)');
  assert.strictEqual(p2pIntent.parameters.currency, 'NGN', 'Currency should be NGN');

  const cashoutIntent = await agent.parseIntent('cash out 10000 NGN to GTBank account 0123456789');
  assert.strictEqual(cashoutIntent.action, 'CASH_OUT', 'Action should parse as CASH_OUT');
  assert.strictEqual(cashoutIntent.parameters.amount, 10000, 'Amount should be 10000');
  assert.strictEqual(cashoutIntent.parameters.bankName.toLowerCase(), 'gtbank', 'Bank should be gtbank (case-insensitive)');
  assert.strictEqual(cashoutIntent.parameters.accountNumber, '0123456789', 'Account number should be 0123456789');
  console.log('✅ Intent Router passed!');

  // 6. Test Bot Conversation flows (bot.js) - Business onboarding and Invoice CREATE2 prediction
  console.log('\nTesting Bot Conversation Flow (bot.js)...');
  const botUserId = 'test_bot_user_' + Date.now();
  
  // A. Start flow (prompts for PIN setup)
  const startMsg = await bot.processMessage(botUserId, '/start');
  assert.ok(startMsg.reply.includes('PIN') || startMsg.reply.includes('Welcome'), 'Bot should prompt user to set up PIN');

  // Submit PIN step 1
  const pinStep1 = await bot.processMessage(botUserId, '1234');
  assert.ok(pinStep1.reply.includes('re-enter') || pinStep1.reply.includes('confirm'), 'Bot should ask to confirm PIN');

  // Submit PIN step 2 -> creates account
  const authMsg = await bot.processMessage(botUserId, '1234');
  assert.ok(authMsg.reply.includes('Account Created'), 'Bot should confirm account creation');

  const session = bot.getSession(botUserId);
  assert.strictEqual(session.state, 'IDLE', 'Session state should be IDLE');

  // B. Switch profile to Business -> triggers profile name setup
  const switchMsg = await bot.processMessage(botUserId, '/switch');
  assert.ok(switchMsg.reply.includes('Business Profile Setup') || switchMsg.reply.includes('Business Profile Onboarding'), 'Bot should prompt for Business Name');
  assert.strictEqual(session.state, 'AWAITING_BIZ_NAME', 'Session state should be AWAITING_BIZ_NAME');

  // Submit Business Name
  const emailMsg = await bot.processMessage(botUserId, 'Afrilink Tech');
  assert.ok(emailMsg.reply.includes('email') || emailMsg.reply.includes('Business Email'), 'Bot should prompt for email');
  assert.strictEqual(session.state, 'AWAITING_BIZ_EMAIL', 'Session state should be AWAITING_BIZ_EMAIL');

  // Submit Business Email
  const logoPromptMsg = await bot.processMessage(botUserId, 'contact@afrilink.tech');
  assert.ok(logoPromptMsg.reply.includes('logo') || logoPromptMsg.reply.includes('Logo'), 'Bot should prompt for logo');
  assert.strictEqual(session.state, 'AWAITING_BIZ_LOGO', 'Session state should be AWAITING_BIZ_LOGO');

  // Skip logo
  const addressPromptMsg = await bot.processMessage(botUserId, 'skip');
  assert.ok(addressPromptMsg.reply.includes('address') || addressPromptMsg.reply.includes('Address'), 'Bot should prompt for address');
  assert.strictEqual(session.state, 'AWAITING_BIZ_ADDRESS', 'Session state should be AWAITING_BIZ_ADDRESS');

  // Skip address and complete profile
  const bizProfileMsg = await bot.processMessage(botUserId, 'skip');
  assert.ok(bizProfileMsg.reply.includes('Business Profile Setup Complete') || bizProfileMsg.reply.includes('Business Profile Active'), 'Bot should report profile active');
  assert.strictEqual(session.state, 'IDLE', 'Session state should reset to IDLE');
  
  const bizUser = db.getUser(botUserId);
  assert.strictEqual(bizUser.active_context, 'business', 'Active context should be business');
  assert.strictEqual(bizUser.business_name, 'Afrilink Tech', 'Business name should match');

  // C. Test Invoice creation flow with CREATE2 prediction
  const invoicePromptMsg = await bot.processMessage(botUserId, 'invoice');
  assert.ok(invoicePromptMsg.reply.includes('amount') || invoicePromptMsg.reply.includes('billing'), 'Bot should ask for invoice amount');
  assert.strictEqual(session.state, 'AWAITING_INV_AMOUNT', 'Session state should be AWAITING_INV_AMOUNT');

  const invoiceFiatPromptMsg = await bot.processMessage(botUserId, '250');
  assert.ok(invoiceFiatPromptMsg.reply.includes('currency') || invoiceFiatPromptMsg.reply.includes('fiat'), 'Bot should ask for fiat currency');
  assert.strictEqual(session.state, 'AWAITING_INV_FIAT_CURRENCY', 'Session state should be AWAITING_INV_FIAT_CURRENCY');

  const invoiceCustPromptMsg = await bot.processMessage(botUserId, 'NGN');
  assert.ok(invoiceCustPromptMsg.reply.includes('customer') || invoiceCustPromptMsg.reply.includes('Customer'), 'Bot should ask for customer');
  assert.strictEqual(session.state, 'AWAITING_INV_CUST', 'Session state should be AWAITING_INV_CUST');

  const invoiceResultMsg = await bot.processMessage(botUserId, 'Kelechi');
  assert.ok(invoiceResultMsg.reply.includes('Invoice Created') || invoiceResultMsg.reply.includes('Invoice Generated'), 'Bot should report success');
  assert.ok(invoiceResultMsg.reply.includes('Pay To') || invoiceResultMsg.reply.includes('Deposit Address') || invoiceResultMsg.reply.includes('wallet address'), 'Bot should present payment wallet');
  assert.ok(invoiceResultMsg.reply.includes('250'), 'Invoice should show exact amount entered');
  assert.strictEqual(session.state, 'IDLE', 'Session state should reset to IDLE');

  const botInvoiceInDb = db.getUserInvoices(botUserId)[0];
  assert.ok(botInvoiceInDb, 'Invoice created by bot should exist in DB');
  assert.ok(invoiceResultMsg.reply.includes(botInvoiceInDb.deposit_address), 'Bot reply deposit address must match stored DB deposit address');

  // D. Test PIN Confirmation Flow for Transfers
  console.log('\nTesting PIN Confirmation state flow in bot.js...');
  const sendPromptMsg = await bot.processMessage(botUserId, 'send 50 USDC to Bob');
  assert.ok(sendPromptMsg.reply.includes('PIN'), 'Bot should prompt for PIN');
  const botSession = bot.getSession(botUserId);
  assert.strictEqual(botSession.state, 'AWAITING_PIN_CONFIRM', 'State should be AWAITING_PIN_CONFIRM');

  // Enter wrong PIN
  const wrongPinMsg = await bot.processMessage(botUserId, '9999');
  assert.ok(wrongPinMsg.reply.includes('Incorrect PIN'), 'Bot should report incorrect PIN');
  assert.strictEqual(botSession.state, 'AWAITING_PIN_CONFIRM', 'State should remain AWAITING_PIN_CONFIRM');

  // Enter correct PIN (1234)
  const confirmMsg = await bot.processMessage(botUserId, '1234');
  assert.ok(confirmMsg.reply.includes('Payment Sent') || confirmMsg.reply.includes('Confirmed') || confirmMsg.reply.includes('Transfer Initiated'), 'Bot should confirm payment after valid PIN');
  assert.strictEqual(botSession.state, 'IDLE', 'State should reset to IDLE');
  console.log('✅ PIN Confirmation state flow passed!');

  // E. Test /sync Command Flow
  console.log('\nTesting /sync command flow in bot.js...');
  const syncGenMsg = await bot.processMessage(botUserId, '/sync');
  assert.ok(syncGenMsg.reply.includes('Sync Code'), 'Bot /sync command should generate a code');

  const appUser = 'app_user_' + Date.now();
  db.createSyncCode(appUser, '112233');
  const syncLinkMsg = await bot.processMessage(botUserId, '/sync 112233');
  assert.ok(syncLinkMsg.reply.includes('Synced Successfully'), 'Bot /sync <code> command should report success');
  console.log('✅ Bot /sync command flow passed!');

  console.log('✅ Bot Conversation Flow passed!');

  console.log('\n🎉 All integration tests passed successfully!');
}

runTests().catch(err => {
  console.error('\n❌ Tests failed:', err);
  process.exit(1);
});

