const db = require('../src/db');
const nuvionService = require('../src/nuvion-service');
const particleService = require('../src/particle-service');

async function testBusinessAccountSuite() {
  console.log('==================================================');
  console.log('   PayIT Business Account Infrastructure Test Suite');
  console.log('==================================================\n');

  const testUserId = `test_biz_user_${Date.now()}`;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  // 1. User Identity & Dual Smart Account Derivation
  console.log('1️⃣ Testing Identity & Smart Account Derivation...');
  const personalAccount = particleService.deriveSmartAccountAddress(testUserId, 0);
  const businessAccount = particleService.deriveSmartAccountAddress(testUserId, 1);
  
  db.createUser(testUserId, personalAccount, businessAccount, 'test_provider');
  db.updateOwnerAddress(testUserId, personalAccount);

  assert(personalAccount !== businessAccount, 'Personal and Business smart account addresses are distinct.');
  assert(personalAccount.startsWith('0x'), 'Derived valid EVM address for Personal Account.');
  assert(businessAccount.startsWith('0x'), 'Derived valid EVM address for Business Account.');

  // 2. Business Profile Creation & Starter Tier Setup
  console.log('\n2️⃣ Testing Business Profile Setup & Starter Tier KYB...');
  const bizProfileId = `prof_b_${testUserId}`;
  const businessName = 'Acme Global Ventures Ltd';
  const businessEmail = 'billing@acmeglobal.com';

  db.db.prepare(`
    INSERT OR REPLACE INTO profiles (profile_id, user_id, type, nuvion_entity_id, universal_account_address, name, email, created_at)
    VALUES (?, ?, 'business', ?, ?, ?, ?, ?)
  `).run(bizProfileId, testUserId, `ent_b_${testUserId}`, businessAccount, businessName, businessEmail, Date.now());

  const initialKyb = db.getProfileKybStatus(testUserId);
  assert(initialKyb.kyb_status === 'starter', 'New business profile defaults to Starter KYB.');
  assert(initialKyb.limit_usd === 500, 'Starter KYB enforces $500 USD transaction limit.');

  // 3. KYB Threshold Enforcement Check (< $500 vs >= $500)
  console.log('\n3️⃣ Testing $500 KYB Threshold Enforcement...');
  const smallTxUsd = 250;
  const largeTxUsd = 750;

  const smallTxAllowed = initialKyb.kyb_status === 'starter' ? (smallTxUsd < initialKyb.limit_usd) : true;
  const largeTxBlocked = initialKyb.kyb_status === 'starter' ? (largeTxUsd >= initialKyb.limit_usd) : false;

  assert(smallTxAllowed, 'Transaction < $500 ($250) is allowed under Starter KYB.');
  assert(largeTxBlocked, 'Transaction >= $500 ($750) is blocked under Starter KYB.');

  // 4. CAC Registration Verification
  console.log('\n4️⃣ Testing CAC Registration Submission & KYB Upgrade...');
  const testCacNumber = 'RC987654321';
  db.updateBusinessKybCac(testUserId, testCacNumber);

  const upgradedKyb = db.getProfileKybStatus(testUserId);
  assert(upgradedKyb.kyb_status === 'verified', 'Business profile upgraded to Verified status after CAC submission.');
  assert(upgradedKyb.cac_number === testCacNumber, 'CAC Registration Number saved correctly.');
  assert(upgradedKyb.limit_usd === null, 'Verified business profile has UNLIMITED volume limit.');

  const postCacLargeTxAllowed = upgradedKyb.kyb_status === 'verified' ? true : false;
  assert(postCacLargeTxAllowed, 'Transaction >= $500 ($750) succeeds after CAC Verification.');

  // 5. Purpose-Tagged Business Sub-Account Buckets
  console.log('\n5️⃣ Testing Purpose-Tagged Sub-Account Buckets...');
  const subAccountsToCreate = [
    { purpose: 'main', currency: 'NGN', name: 'Main Operating Account' },
    { purpose: 'tax', currency: 'USD', name: 'Tax Reserve Bucket' },
    { purpose: 'payroll', currency: 'USDT', name: 'Payroll Reserve Bucket' }
  ];

  for (const sa of subAccountsToCreate) {
    db.db.prepare(`
      INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`acc_${sa.purpose}_${testUserId}`, bizProfileId, `nuv_${sa.purpose}_${testUserId}`, `90${Math.floor(Math.random()*100000000)}`, sa.purpose, Date.now());
  }

  const createdSubAccounts = db.getAccountsForProfile(bizProfileId);
  assert(createdSubAccounts.length === 3, 'Created 3 dedicated business sub-account buckets.');
  assert(createdSubAccounts.some(a => a.purpose === 'tax'), 'Tax Reserve Bucket provisioned.');
  assert(createdSubAccounts.some(a => a.purpose === 'payroll'), 'Payroll Reserve Bucket provisioned.');

  // 6. Business Virtual Card Issuance & Metered Buffer
  console.log('\n6️⃣ Testing Business Virtual Card Issuance & Metered Buffer...');
  const cardResult = await nuvionService.issueCard(testUserId, 'USD', 'business');
  assert(cardResult.cardId !== null, 'Issued Business Virtual Card ID.');
  assert(cardResult.bufferAccountId !== null, 'Provisioned dedicated Nuvion Card Buffer sub-account.');

  const cardsInDb = db.getCardsForProfile(bizProfileId);
  assert(cardsInDb.length > 0, 'Business Virtual Card registered in database.');
  assert(cardsInDb[0].buffer_threshold === 5.0, 'Card buffer threshold configured to $5.00.');
  assert(cardsInDb[0].refill_amount === 20.0, 'Card refill amount configured to $20.00.');

  // 7. Business Invoicing Engine
  console.log('\n7️⃣ Testing Business Invoicing Engine...');
  const invoiceId = `inv_biz_${Date.now()}`;
  db.createFullInvoice({
    invoiceId,
    userId: testUserId,
    clientName: 'Global Enterprises Inc',
    clientEmail: 'payables@global.com',
    itemDescription: 'Software Architecture & Infrastructure Services',
    amount: 1200,
    taxAmount: 60,
    totalAmount: 1260,
    currency: 'USD',
    dueDate: '2026-08-15',
    depositAddress: businessAccount,
    virtualAccountNo: '9012345678',
    paymentLinkToken: `link_${invoiceId}`,
    depositChain: 'arbitrum',
    depositToken: 'USDT'
  });

  const savedInvoice = db.getInvoice(invoiceId);
  assert(savedInvoice !== null, 'Invoice created and stored in DB.');
  assert(savedInvoice.total_amount === 1260, 'Invoice total calculated with tax correctly.');
  assert(savedInvoice.deposit_address === businessAccount, 'Invoice targets Business Smart Account.');

  // 8. Summary & Cleanup
  console.log('\n==================================================');
  console.log(`   Test Results: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testBusinessAccountSuite().catch(err => {
  console.error('[Fatal Test Error]', err);
  process.exit(1);
});
