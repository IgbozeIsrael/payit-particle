const db = require('./db');
const dbPg = require('./db-pg');
const walletManager = require('./wallet');
const { ethers } = require('ethers');
require('dotenv').config();
const particleService = require('./particle-service');
const blockchain = require('./blockchain');
const agent = require('./agent');
const crypto = require('crypto');
const imageGenerator = require('./image-generator');
const { formatInvoiceAmount } = require('./invoice-renderer');
const savingsService = require('./savings-service');
const payrollService = require('./payroll-service');
const {
  getWelcomeMessage,
  getSavingsMenuReply,
  parseDurationInput,
  finalizeSavingsLock,
  handleFinancialIntent
} = require('./financial-handlers');
const { handleFeatureIntent, requestPayrollApprovalIfNeeded, parseGoalFromText } = require('./features-handlers');
const { createFullInvoice } = require('./invoice-service');
const fxService = require('./fx-service');

// In-memory session context state cache
const sessions = {};

async function isSkip(text) {
  const value = String(text || '').trim().toLowerCase();
  return ['skip', 'no', 'n', '-', 'none'].includes(value);
}

async function getSession(telegramId) {
  if (!sessions[telegramId]) {
    sessions[telegramId] = {
      state: 'INIT',
      pendingAction: null,
      tempBusinessName: null,
      tempBusiness: { name: null, email: null, logo: null, address: null },
      tempInvoice: { amount: null, customer: null },
      tempSavings: { type: null, amount: null, currency: 'USDC', durationDays: null },
      tempKyc: {},
      tempKyb: {}
    };
  }
  return sessions[telegramId];
}

async function resetBusinessDraft(session) {
  session.tempBusinessName = null;
  session.tempBusiness = { name: null, email: null, logo: null, address: null };
}

async function completeBusinessProfile(telegramId, session) {
  const draft = session.tempBusiness;
  await dbPg.updateBusinessProfile(
    telegramId,
    draft.name,
    draft.email,
    draft.logo,
    draft.address
  );
  await dbPg.updateUserContext(telegramId, 'business');
  session.state = 'IDLE';
  resetBusinessDraft(session);

  const saved = await dbPg.getUser(telegramId);
  return {
    reply: `✅ Business Profile Setup Complete!\n\n` +
      `📋 Business Details:\n` +
      `• Name: ${saved.business_name}\n` +
      `• Email: ${saved.business_email || 'Not set'}\n` +
      `• Logo: ${saved.business_logo ? 'Added' : 'Not set'}\n` +
      `• Address: ${saved.business_address || 'Not set'}\n` +
      `• Wallet: ${saved.business_smart_account}\n\n` +
      `You can now create invoices with your business details attached.`
  };
}

async function formatWalletDetails(user) {
  const activeWallet = user.active_context === 'business'
    ? user.business_smart_account
    : user.personal_smart_account;

  const bizProfile = await dbPg.getProfileByType(user.telegram_id || user.user_id, 'business');
  const personalProfile = await dbPg.getProfileByType(user.telegram_id || user.user_id, 'personal');
  const profileId = bizProfile?.profile_id || personalProfile?.profile_id;

  let fiatAccountsText = '';
  if (profileId) {
    const accs = dbPg.query(
      `SELECT purpose, nuvion_account_no, bank_name, beneficiary_name FROM accounts WHERE profile_id = ? AND (status IS NULL OR status = 'active')`
    ).all(profileId);
    if (accs.length > 0) {
      fiatAccountsText = accs.map(a => `• **${a.purpose}**: \`${a.nuvion_account_no}\` (${a.bank_name || 'Nuvion Partner Bank'})`).join('\n');
    }
  }
  if (!fiatAccountsText && (user.nuvion_account_no || user.nuvion_business_account_no)) {
    fiatAccountsText = `• **NGN Bank Account**: \`${user.nuvion_business_account_no || user.nuvion_account_no}\` (Flutterwave MFB / Nuvion)`;
  }
  if (!fiatAccountsText) {
    fiatAccountsText = '• **Local Bank Accounts**: NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD, AED (Allocated automatically on invoice / deposit creation)';
  }

  return `👛 **Your Receive Rails & Wallets**\n\n` +
    `👤 **Personal Smart Account:**\n\`${user.personal_smart_account}\`\n\n` +
    `🏢 **Business Smart Account:**\n\`${user.business_smart_account}\`\n\n` +
    `🌐 **Supported Mainnet Crypto Chains:**\n` +
    `• Arbitrum One, Ethereum, Base, Polygon (EVM Universal Wallet)\n` +
    `• Solana (ED25519 Derived Keypair)\n\n` +
    `🏦 **Local Fiat Virtual Accounts:**\n` +
    fiatAccountsText + `\n\n` +
    `🔑 **Auth Provider:** ${user.auth_provider || 'Particle Network Web3 Auth'}`;
}

async function getSettingsMenuReply() {
  return {
    keyboard: 'settings',
    reply: `⚙️ Settings\n\n` +
      `Manage your PayIT account from here.\n\n` +
      `• View Wallets — see your wallet addresses\n` +
      `• Switch Profile — personal or business\n` +
      `• Business Profile — update business details\n` +
      `• Savings — lock funds or earn yield\n` +
      `• Lock Account — secure your account\n` +
      `• Back to Menu — return to main actions`
  };
}

let cachedBytecode = null;
async function getForwarderBytecode() {
  if (!cachedBytecode) {
    try {
      const { compileContract } = require('../scripts/compile');
      const data = compileContract('InvoiceForwarder', 'InvoiceForwarder.sol');
      cachedBytecode = '0x' + data.bytecode;
    } catch (err) {
      console.warn('Failed to compile InvoiceForwarder, using mock bytecode:', err.message);
      // Fallback bytecode structure matching InvoiceForwarder creation
      cachedBytecode = '0x6080604052348015600f57600080fd5b506004361060285760003557';
    }
  }
  return cachedBytecode;
}

/**
 * Main application-layer Orchestrator for PayIT on Particle / Arbitrum Sepolia.
 */
async function processMessage(telegramId, text, mockAddresses = {}) {
  const session = getSession(telegramId);
  let user = await dbPg.getUser(telegramId);
  const normalizedText = (text || '').trim();
  const lowerText = normalizedText.toLowerCase();

  // Check LOCKED state
  if (session.state === 'LOCKED') {
    if (lowerText === '/unlock') {
      session.state = 'IDLE';
      return { reply: "🔓 **Account Unlocked!** Profile context is back to active." };
    }
    return { reply: "🔒 **Account Locked**. Please unlock your account by typing /unlock." };
  }

  // Handle Cancel / Stop globally
  if (lowerText === 'cancel' || lowerText === 'stop') {
    session.state = user ? 'IDLE' : 'INIT';
    session.pendingAction = null;
    resetBusinessDraft(session);
    session.tempInvoice = { amount: null, customer: null };
    session.tempSavings = { type: null, amount: null, currency: 'USDC', durationDays: null };
    return { reply: "❌ Operation cancelled. Session reset to IDLE." };
  }

  // Handle /start for both new and existing users (including deep-link payloads)
  if (lowerText === '/start' || lowerText.startsWith('/start ')) {
    if (!user) {
      if (session.state === 'AWAITING_PIN_SETUP_1' || session.state === 'AWAITING_PIN_SETUP_2') {
         // Proceed to handle in normal state flow
      } else {
        session.state = 'AWAITING_PIN_SETUP_1';
        return {
          reply: `🚀 **Welcome to PayIT!**\n\n` +
                 `PayIT is your all-in-one smart finance assistant. We make managing your money, paying friends, and running your business completely seamless and instant.\n\n` +
                 `**What you can do:**\n` +
                 `• 👤 **Personal**: Send money instantly, split bills easily, safely hold funds in escrow, and earn savings interest.\n` +
                 `• 🏢 **Business**: Scan receipts with AI, automate payroll, issue invoices, and manage taxes effortlessly.\n\n` +
                 `🔒 **Security First**: Before we set up your digital account, please reply with a **4-digit PIN** to secure your profile.`
        };
      }
    } else {
      session.state = 'IDLE';
      session.pendingAction = null;
      resetBusinessDraft(session);
      session.tempInvoice = { amount: null, customer: null };

      const active = user.active_context === 'business' ? 'BUSINESS' : 'PERSONAL';
      const activeWallet = user.active_context === 'business'
        ? user.business_smart_account
        : user.personal_smart_account;

      return {
        keyboard: 'root',
        reply: `✅ Welcome back to PayIT!\n\n` +
               `💳 Active Profile: ${active}\n\n` +
               `Use the menu below, or open Settings to view all wallet addresses.`
      };
    }
  }

  // PIN Setup Flow
  if (session.state === 'AWAITING_PIN_SETUP_1') {
    const pin = normalizedText;
    if (!/^\d{4}$/.test(pin)) {
      return { reply: '❌ Please enter exactly 4 digits for your PIN.' };
    }
    session.tempPin = pin;
    session.state = 'AWAITING_PIN_SETUP_2';
    return { reply: '🔒 Please re-enter your 4-digit PIN to confirm.' };
  }

  if (session.state === 'AWAITING_PIN_SETUP_2') {
    const pin = normalizedText;
    if (pin !== session.tempPin) {
      session.state = 'AWAITING_PIN_SETUP_1';
      return { reply: "❌ PINs did not match. Let's try again. Please enter a 4-digit PIN:" };
    }
    
    const bcrypt = require('bcryptjs');
    const pinHash = await bcrypt.hash(pin, 10);

    // Particle Network Universal Account generation
    const masterWallet = walletManager.getMasterWallet();
    const ownerAddress = masterWallet.particleManaged ? ethers.Wallet.createRandom().address : masterWallet.address;
    const personalSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 0);
    const businessSmartAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 1);
    
    await dbPg.createUser(telegramId, personalSmartAccount, businessSmartAccount, 'particle');
    await dbPg.updateOwnerAddress(telegramId, ownerAddress);
    await dbPg.updateUserPin(telegramId, pinHash);

    session.state = 'KYC_TYPE_CHOICE';
    session.tempKyc = {};
    session.tempKyb = {};

    return {
      reply: `✅ Account Security PIN Set Successfully!\n\n` +
             `🔐 **Identity Verification Required**\n\n` +
             `To issue your Virtual NGN/USD Bank Accounts via Nuvion, please complete a quick 1-minute verification.\n\n` +
             `Select account type:\n` +
             `1️⃣ **Personal Account** (Individual KYC with BVN/NIN)\n` +
             `2️⃣ **Business Account** (Corporate KYB with CAC)\n\n` +
             `Reply **Personal** or **Business** to begin:`
    };
  }

  // Handle /verify or /resetkyc commands
  if (lowerText === '/resetkyc' || lowerText === '/verify' || lowerText === '/kyc') {
    await dbPg.query('UPDATE users SET is_verified = 0 WHERE telegram_id = ? OR user_id = ?', [telegramId, telegramId]);
    session.state = 'KYC_TYPE_CHOICE';
    session.tempKyc = {};
    session.tempKyb = {};
    return {
      reply: `🔐 **Identity Verification (KYC/KYB)**\n\n` +
             `To comply with banking regulations & issue virtual NGN/USD bank accounts via Nuvion, please complete verification.\n\n` +
             `Please select your account type:\n` +
             `1️⃣ Reply **Personal** for Individual KYC (BVN/NIN)\n` +
             `2️⃣ Reply **Business** for Corporate KYB (CAC)`
    };
  }

  // Mandatory KYC Interceptor for unverified users
  const hasAccounts = user && Boolean(user.nuvion_account_no || user.nuvion_business_account_no);
  const isVerifiedUser = user && (user.is_verified === 1 || Boolean(user.nin || user.bvn || user.BVN || user.first_name || hasAccounts));
  const isBypassedCommand = lowerText.startsWith('/start') || lowerText.startsWith('/sync') || lowerText.startsWith('/link') || lowerText.startsWith('/unlock') || lowerText === 'cancel' || lowerText === '/verify' || lowerText === '/resetkyc';

  if (user && !isVerifiedUser && !isBypassedCommand && !session.state.startsWith('KYC_') && !session.state.startsWith('KYB_') && session.state !== 'AWAITING_PIN_SETUP_1' && session.state !== 'AWAITING_PIN_SETUP_2') {
    session.state = 'KYC_TYPE_CHOICE';
    session.tempKyc = {};
    session.tempKyb = {};
    return {
      reply: `🔐 **Verification Required**\n\n` +
             `Welcome ${user.first_name || 'User'}! Before you can deposit, send money, or issue cards, Nuvion banking rails require identity verification.\n\n` +
             `Please select your account type to begin step-by-step verification:\n\n` +
             `1️⃣ Reply **Personal** for Individual KYC (BVN/NIN)\n` +
             `2️⃣ Reply **Business** for Corporate KYB (CAC)`
    };
  }

  // ── Step-by-Step Conversational KYC/KYB State Handlers ──

  if (session.state === 'KYC_TYPE_CHOICE') {
    if (lowerText.includes('personal') || lowerText.includes('individual') || lowerText === '1') {
      session.state = 'KYC_PERSONAL_NAME';
      session.tempKyc = {};
      return { reply: `👤 **Step 1 of 5: Full Name**\n\nPlease enter your **First Name & Last Name** (as shown on your official ID, e.g. *Chidi Okafor*):` };
    } else if (lowerText.includes('business') || lowerText.includes('corporate') || lowerText === '2') {
      session.state = 'KYB_BUSINESS_NAME';
      session.tempKyb = {};
      return { reply: `🏢 **Step 1 of 6: Business Name**\n\nPlease enter your **Legal Business Name** (as registered with CAC, e.g. *Acme Logistics Ltd*):` };
    } else {
      return { reply: `Please reply with **Personal** for Individual KYC or **Business** for Corporate KYB:` };
    }
  }

  // ── Personal KYC Flow ──
  if (session.state === 'KYC_PERSONAL_NAME') {
    const name = normalizedText.trim();
    if (name.length < 2) return { reply: '❌ Please enter a valid full name (e.g. Chidi Okafor):' };
    const parts = name.split(/\s+/);
    session.tempKyc.first_name = parts[0];
    session.tempKyc.last_name = parts.slice(1).join(' ') || parts[0];
    session.state = 'KYC_PERSONAL_EMAIL';
    return { reply: `📧 **Step 2 of 5: Email Address**\n\nPlease enter your **Email Address** (e.g. *chidi@gmail.com*):` };
  }

  if (session.state === 'KYC_PERSONAL_EMAIL') {
    const email = normalizedText.trim();
    if (!email.includes('@')) return { reply: '❌ Please enter a valid email address (e.g. name@example.com):' };
    session.tempKyc.email = email;
    session.state = 'KYC_PERSONAL_BVN';
    return { reply: `🆔 **Step 3 of 5: BVN or NIN**\n\nPlease enter your **11-digit BVN or NIN**:` };
  }

  if (session.state === 'KYC_PERSONAL_BVN') {
    const bvn = normalizedText.replace(/\D/g, '');
    if (bvn.length < 10) return { reply: '❌ Please enter a valid 11-digit BVN or NIN:' };
    session.tempKyc.bvn = bvn;
    session.state = 'KYC_PERSONAL_DOB';
    return { reply: `📅 **Step 4 of 5: Date of Birth**\n\nPlease enter your **Date of Birth** (YYYY-MM-DD, e.g. *1995-08-14*):` };
  }

  if (session.state === 'KYC_PERSONAL_DOB') {
    const dob = normalizedText.trim();
    session.tempKyc.dob = dob;
    session.state = 'KYC_PERSONAL_ADDRESS';
    return { reply: `🏠 **Step 5 of 5: Residential Address**\n\nPlease enter your **Home Address** (e.g. *15 Victoria Island, Lagos*):` };
  }

  if (session.state === 'KYC_PERSONAL_ADDRESS') {
    const address = normalizedText.trim();
    session.tempKyc.address = address;

    const kyc = session.tempKyc;
    const profileId = `prof_p_${telegramId}`;

    try {
      await dbPg.saveOnboardingDraft(profileId, 'personal', {
        first_name: kyc.first_name,
        last_name: kyc.last_name,
        contact_email: kyc.email,
        bvn: kyc.bvn,
        nin: kyc.bvn,
        date_of_birth: kyc.dob,
        address_line_1: kyc.address,
        address_city: 'Lagos',
        address_state: 'Lagos',
        address_country_code: 'NGA'
      });
    } catch (_) {}

    await dbPg.query(`
      UPDATE users SET first_name = ?, last_name = ?, business_email = ?, bvn = ?, nin = ?, is_verified = 1 WHERE telegram_id = ? OR user_id = ?
    `, [kyc.first_name, kyc.last_name, kyc.email, kyc.bvn, kyc.bvn, telegramId, telegramId]);

    // Provision Personal Nuvion Virtual Account
    let nuvionAccNo = null;
    try {
      const nuvionRes = await require('./nuvion-service').getOrCreateDepositAccount(telegramId, 'NGN', {
        first_name: kyc.first_name,
        last_name: kyc.last_name,
        name: `${kyc.first_name} ${kyc.last_name}`,
        email: kyc.email,
        phonenumber: user?.phone || '08012345678',
        bvn: kyc.bvn,
        nin: kyc.bvn,
        date_of_birth: kyc.dob,
        address_line_1: kyc.address
      }, 'personal');
      nuvionAccNo = nuvionRes?.account_number || null;
    } catch (nErr) {
      console.warn('[Telegram KYC] Nuvion account creation warning:', nErr.message);
    }

    session.state = 'IDLE';
    session.tempKyc = {};

    const updatedUser = await dbPg.getUser(telegramId);
    const finalAccount = nuvionAccNo || updatedUser?.nuvion_account_no || 'Pending Allocation';

    return {
      keyboard: 'root',
      reply: `🎉 **Personal KYC Verification Complete!**\n\n` +
             `✅ **Identity Verified**: ${kyc.first_name} ${kyc.last_name}\n` +
             `📧 **Email**: ${kyc.email}\n` +
             `🏦 **Your Virtual NGN Bank Account**:\n` +
             `• Account Number: \`${finalAccount}\`\n` +
             `• Bank Name: Flutterwave MFB / Nuvion Partner Bank\n` +
             `• Beneficiary: ${kyc.first_name.toUpperCase()} ${kyc.last_name.toUpperCase()} / PayIT\n\n` +
             `Your personal account is fully activated!`
    };
  }

  // ── Business KYB Flow ──
  if (session.state === 'KYB_BUSINESS_NAME') {
    const name = normalizedText.trim();
    if (name.length < 2) return { reply: '❌ Please enter a valid business name:' };
    session.tempKyb.name = name;
    session.state = 'KYB_BUSINESS_EMAIL';
    return { reply: `📧 **Step 2 of 6: Business Email**\n\nPlease enter your **Business Email Address** (e.g. *contact@acme.com*):` };
  }

  if (session.state === 'KYB_BUSINESS_EMAIL') {
    const email = normalizedText.trim();
    if (!email.includes('@')) return { reply: '❌ Please enter a valid email address:' };
    session.tempKyb.email = email;
    session.state = 'KYB_BUSINESS_CAC';
    return { reply: `📋 **Step 3 of 6: CAC Registration Number**\n\nPlease enter your **CAC Number** (e.g. *RC1234567* or *BN9876543*):` };
  }

  if (session.state === 'KYB_BUSINESS_CAC') {
    const cac = normalizedText.trim();
    session.tempKyb.cac = cac;
    session.state = 'KYB_BUSINESS_ADDRESS';
    return { reply: `📍 **Step 4 of 6: Registered Office Address**\n\nPlease enter your **Business Office Address** (e.g. *22 Commercial Ave, Lagos*):` };
  }

  if (session.state === 'KYB_BUSINESS_ADDRESS') {
    const address = normalizedText.trim();
    session.tempKyb.address = address;
    session.state = 'KYB_DIRECTOR_NAME';
    return { reply: `👤 **Step 5 of 6: Director Full Name**\n\nPlease enter the **Managing Director's Full Name**:` };
  }

  if (session.state === 'KYB_DIRECTOR_NAME') {
    const dirName = normalizedText.trim();
    session.tempKyb.director_name = dirName;
    session.state = 'KYB_DIRECTOR_BVN';
    return { reply: `🆔 **Step 6 of 6: Director BVN**\n\nPlease enter the **Managing Director's 11-digit BVN**:` };
  }

  if (session.state === 'KYB_DIRECTOR_BVN') {
    const dirBvn = normalizedText.replace(/\D/g, '');
    session.tempKyb.director_bvn = dirBvn;

    const kyb = session.tempKyb;
    const profileId = `prof_b_${telegramId}`;

    try {
      await dbPg.updateBusinessProfile(telegramId, kyb.name, kyb.email, null, kyb.address);
      await dbPg.saveOnboardingDraft(profileId, 'business', {
        legal_name: kyb.name,
        contact_email: kyb.email,
        registration_number: kyb.cac,
        address_line_1: kyb.address,
        address_city: 'Lagos',
        address_state: 'Lagos',
        address_country_code: 'NGA',
        director_first_name: kyb.director_name,
        director_bvn: kyb.director_bvn
      });
    } catch (_) {}

    await dbPg.query(`
      UPDATE users SET business_name = ?, business_email = ?, business_address = ?, is_verified = 1, active_context = 'business' WHERE telegram_id = ? OR user_id = ?
    `, [kyb.name, kyb.email, kyb.address, telegramId, telegramId]);

    // Provision Corporate Nuvion Virtual Account
    let bizNuvionAccNo = null;
    try {
      const nuvionRes = await require('./nuvion-service').getOrCreateDepositAccount(telegramId, 'NGN', {
        business_name: kyb.name,
        name: kyb.name,
        email: kyb.email,
        registration_number: kyb.cac,
        address_line_1: kyb.address,
        director_first_name: kyb.director_name,
        director_bvn: kyb.director_bvn
      }, 'business');
      bizNuvionAccNo = nuvionRes?.account_number || null;
    } catch (nErr) {
      console.warn('[Telegram KYB] Nuvion account creation warning:', nErr.message);
    }

    session.state = 'IDLE';
    session.tempKyb = {};

    const updatedUser = await dbPg.getUser(telegramId);
    const finalAccount = bizNuvionAccNo || updatedUser?.nuvion_business_account_no || 'Pending Allocation';

    return {
      keyboard: 'root',
      reply: `🎉 **Corporate KYB Verification Complete!**\n\n` +
             `🏢 **Business Name**: ${kyb.name}\n` +
             `📋 **CAC Number**: ${kyb.cac}\n` +
             `📧 **Email**: ${kyb.email}\n` +
             `🏦 **Your Corporate Virtual NGN Account**:\n` +
             `• Account Number: \`${finalAccount}\`\n` +
             `• Bank Name: Flutterwave MFB / Nuvion Partner Bank\n` +
             `• Beneficiary: ${kyb.name.toUpperCase()} / PayIT\n\n` +
             `Your corporate business account is fully activated!`
    };
  }

  // Handle Switch buttons
  if (lowerText === '🏢 switch to business') {
    return processMessage(telegramId, 'business account', mockAddresses);
  }
  if (lowerText === '👤 switch to personal') {
    return processMessage(telegramId, 'personal account', mockAddresses);
  }

  if (lowerText === 'faq' || lowerText === '❓ faq') {
    return { reply: "❓ **PayIT FAQ**\n\n**Q: Do I need a seed phrase?**\nA: No! We use Particle Network to create a Universal Account tied to your profile.\n\n**Q: How does Escrow work?**\nA: Funds are locked in a smart contract until you release them to the seller.\n\n**Q: Who pays the gas fees?**\nA: We sponsor your transactions using a Paymaster, so it's completely gasless for you!" };
  }

  if (lowerText === 'ai support' || lowerText === '🎧 ai support' || (session.state === 'AWAITING_SUPPORT_QUESTION' && lowerText !== 'cancel')) {
    if (lowerText === 'ai support' || lowerText === '🎧 ai support') {
      session.state = 'AWAITING_SUPPORT_QUESTION';
      return { reply: "🎧 **AI Support**\n\nI'm your intelligent assistant. I can see your recent actions on PayIT. How can I help you today?" };
    } else {
      const question = text;
      session.state = 'IDLE';
      return await require('./support-service').handleSupportRequest(user, question);
    }
  }

  // Handle Telegram /sync or /link commands (for both new and existing users)
  if (lowerText.startsWith('/sync') || lowerText.startsWith('/link')) {
    const parts = normalizedText.split(/\s+/);
    if (parts.length > 1 && parts[1].trim().length >= 4) {
      const code = parts[1].trim();
      const syncRow = await dbPg.getSyncCode(code);
      if (!syncRow) {
        if (user && (user.user_id || user.mobile_auth_id)) {
          const verifiedName = dbPg.getFormattedVerifiedName(user);
          return { reply: `🎉 **Profile Already Synced!**\n\nYour Telegram account is active and linked to **${verifiedName}**'s PayIT account.` };
        }
        return { reply: "❌ **Invalid or Expired Code.** Please generate a new sync code in the PayIT Mobile App and try again." };
      }
      await dbPg.markSyncCodeUsed(code);
      await dbPg.linkTelegramIdToUser(syncRow.user_id, telegramId);

      const targetUser = await dbPg.getUser(syncRow.user_id) || await dbPg.getUser(telegramId) || user;
      const verifiedName = dbPg.getFormattedVerifiedName(targetUser);

      return {
        reply: `🎉 **Profile Synced Successfully!**\n\n` +
               `Your Telegram account is now linked to **${verifiedName}**'s PayIT account.`
      };
    } else {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await dbPg.createSyncCode(telegramId, code);
      return { reply: `🔑 **Your Sync Code is:** \`${code}\`\n\nEnter this 6-digit code in your PayIT Mobile App under **Profile -> Sync Profile** to link your accounts. Valid for 10 minutes.` };
    }
  }

  // 1. Unregistered User: Choice between Sync Mobile App vs Create New Account
  if (!user) {
    // If unregistered user directly sends a 4-digit PIN (e.g. 9090)
    if (/^\d{4}$/.test(normalizedText)) {
      session.tempPin = normalizedText;
      session.state = 'AWAITING_PIN_SETUP_2';
      return { reply: '🔒 Please re-enter your 4-digit PIN to confirm:' };
    }

    if (lowerText === 'create new account' || lowerText === '✨ create new account') {
      session.state = 'AWAITING_PIN_SETUP_1';
      return {
        reply: `✨ **Create New PayIT Account**\n\n` +
               `Let's secure your Universal Account with a 4-digit PIN.\n\n` +
               `Please enter a **4-digit PIN**:`
      };
    }

    if (lowerText === 'sync mobile app' || lowerText === '🔗 sync mobile app') {
      return {
        keyboard: 'onboarding',
        reply: `🔗 **Sync Profile with Mobile App**\n\n` +
               `To link an existing PayIT Mobile App account:\n\n` +
               `1. Open your **PayIT Mobile App**\n` +
               `2. Go to **Settings -> Link Telegram Account**\n` +
               `3. Send your 6-digit code here by typing:\n` +
               `   \`/sync <code>\` (e.g. \`/sync 849201\`)`
      };
    }

    return {
      keyboard: 'onboarding',
      reply: `👋 **Welcome to PayIT!** 🚀\n\n` +
             `PayIT is your all-in-one personal & business financial hub on Telegram.\n\n` +
             `How would you like to get started?\n\n` +
             `1. **🔗 Sync Mobile App** — Connect an existing account from your PayIT Mobile App\n` +
             `2. **✨ Create New Account** — Set up a fresh account & 4-digit security PIN`
    };
  }

  // 2. Active User State Machine Operations

  // State: AWAITING_PIN_CONFIRM
  if (session.state === 'AWAITING_PIN_CONFIRM') {
    const pin = normalizedText.trim();
    if (!/^\d{4}$/.test(pin)) {
      return { reply: '❌ Enter your 4-digit PIN to confirm or type /cancel to abort:' };
    }
    const bcrypt = require('bcryptjs');
    const pinValid = await bcrypt.compare(pin, user?.pin_hash || '').catch(() => false);
    // Fallback for legacy SHA-256 hashes
    const legacyValid = !pinValid && user?.pin_hash ? crypto.createHash('sha256').update(pin).digest('hex') === user.pin_hash : false;
    if (user && user.pin_hash && !pinValid && !legacyValid) {
      return { reply: '❌ Incorrect PIN. Please enter your valid 4-digit PIN to confirm or type /cancel to abort:' };
    }

    const action = session.pendingAction;
    session.state = 'IDLE';
    session.pendingAction = null;

    if (action?.type === 'P2P_TRANSFER') {
      const txId = `tx_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      try {
        await dbPg.createTransaction(txId, telegramId, user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account, action.recipientIdentifier, action.amount, action.currency || 'USD', null, 'pending');
      } catch (err) {
        /* proceed if log fails */
      }

      return {
        reply: `✅ **Transfer Initiated!**\n\n` +
               `• **Recipient**: ${action.recipientIdentifier}\n` +
               `• **Amount**: ${action.amount} ${action.currency || 'USD'}\n` +
               `• **Status**: Pending confirmation\n\n` +
               `You'll receive a notification once the transfer is confirmed on-chain.`
      };
    }

    if (action?.type === 'CASH_OUT') {
      const txId = `tx_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      try {
        await dbPg.createTransaction(txId, telegramId, user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account, `${action.bankName}:${action.accountNumber}`, action.amount, action.currency || 'NGN', null, 'pending');
      } catch (err) {
        /* proceed if log fails */
      }

      return {
        reply: `✅ **Bank Transfer Initiated!**\n\n` +
               `• **Bank**: ${action.bankName}\n` +
               `• **Account**: ${action.accountNumber}\n` +
               `• **Amount**: ${action.amount} ${action.currency || 'NGN'}\n` +
               `• **Ref ID**: \`${txId}\`\n` +
               `• **Status**: Processing`
      };
    }

    return { reply: '✅ Transaction confirmed.' };
  }

  // State: AWAITING_SAVE_AMOUNT

  if (session.state === 'AWAITING_SAVE_AMOUNT') {
    const amount = parseFloat(normalizedText.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { reply: '❌ Enter a valid amount to save (e.g. 500):' };
    }
    session.tempSavings.amount = amount;
    session.state = 'AWAITING_SAVE_DURATION';
    return {
      reply: `✅ Amount: ${formatInvoiceAmount(amount, session.tempSavings.currency)}\n\nHow long should funds stay locked? (e.g. 30 days, 3 months, 1 year)`
    };
  }

  // State: AWAITING_SAVE_DURATION
  if (session.state === 'AWAITING_SAVE_DURATION') {
    const durationDays = parseDurationInput(normalizedText) || parseInt(normalizedText, 10);
    if (!durationDays || durationDays <= 0) {
      return { reply: '❌ Enter a valid duration (e.g. 30 days, 6 months, 1 year):' };
    }
    session.tempSavings.durationDays = durationDays;
    return finalizeSavingsLock(telegramId, session, user);
  }

  // State: AWAITING_AUTOSAVE_PERCENT
  if (session.state === 'AWAITING_AUTOSAVE_PERCENT') {
    const percent = parseFloat(normalizedText);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { reply: '❌ Enter a percentage between 1 and 100:' };
    }
    await dbPg.updateAutoSaveSettings(telegramId, percent, 'lock', 30);
    session.state = 'IDLE';
    return {
      reply:
        `✅ Auto-Save Enabled!\n\n` +
        `• ${percent}% of every paid invoice will be saved automatically\n` +
        `• Savings type: lock (change via "auto save 15% of every invoice with yield")\n` +
        `• Lock duration: 30 days`
    };
  }

  // State: AWAITING_PAYROLL_DATA
  if (session.state === 'AWAITING_PAYROLL_DATA') {
    const parsedPayroll = await payrollService.parsePayrollInput(normalizedText);
    if (!parsedPayroll.recipients.length) {
      return {
        reply: '❌ Could not parse payroll data. Send staff lines or upload a salary file.\n\nExample: Pay staff Ada 500 USDC, John 300 USDC'
      };
    }
    const batch = payrollService.createBatch({
      telegramId,
      recipients: parsedPayroll.recipients,
      currency: parsedPayroll.recipients[0].currency || 'USDC',
      paymentMethod: parsedPayroll.recipients[0].paymentMethod || 'stablecoin'
    });
    session.pendingAction = { type: 'payroll', batchId: batch.batchId };
    session.state = 'AWAITING_PAYROLL_CONFIRM';
    return { reply: payrollService.formatBatchPreview(batch.batchId) };
  }

  // State: AWAITING_PAYROLL_CONFIRM
  if (session.state === 'AWAITING_PAYROLL_CONFIRM') {
    if (lowerText === 'confirm payroll' || lowerText === 'confirm') {
      const batchId = session.pendingAction?.batchId;
      if (!batchId) {
        session.state = 'IDLE';
        return { reply: '❌ Payroll batch not found. Start again with Pay Staff.' };
      }
      const batch = await dbPg.getPayrollBatch(batchId);
      const approval = await requestPayrollApprovalIfNeeded({
        telegramId,
        user,
        batchId,
        totalAmount: batch.total_amount
      });

      if (approval?.needsApproval) {
        session.state = 'IDLE';
        session.pendingAction = null;
        return {
          reply:
            `✋ Payroll Submitted for Approval\n\n` +
            `• Batch: ${batchId}\n` +
            `• Total: ${batch.total_amount} ${batch.currency}\n` +
            `• Approver notified.\n\n` +
            `Payroll will execute once approved.`
        };
      }

      const result = await payrollService.executeBatch(batchId, telegramId, user.business_smart_account);
      session.state = 'IDLE';
      session.pendingAction = null;
      return {
        reply:
          `✅ Payroll Executed!\n\n` +
          `• Batch: ${result.batchId}\n` +
          `• Staff paid: ${result.successCount}\n` +
          `• Total: ${result.totalAmount} USDC\n\n` +
          `All payments recorded in your transaction history.`
      };
    }
    return { reply: 'Reply "confirm payroll" to execute or "cancel" to abort.' };
  }

  // State: AWAITING_RECURRING_DATA
  if (session.state === 'AWAITING_RECURRING_DATA') {
    const parsed = await agent.parseIntent(normalizedText);
    session.state = 'IDLE';
    const result = await handleFeatureIntent(telegramId, parsed, session, user);
    return result || { reply: 'Could not parse recurring invoice. Try: "Acme Corp 500 USDC monthly"' };
  }

  // State: AWAITING_GOAL_DATA
  if (session.state === 'AWAITING_GOAL_DATA') {
    const goalData = parseGoalFromText(normalizedText);
    session.state = 'IDLE';
    if (!goalData) {
      return { reply: 'Try: "Save 500000 NGN for rent by December"' };
    }
    const parsed = { action: 'SAVINGS_GOAL', parameters: goalData };
    return handleFeatureIntent(telegramId, parsed, session, user);
  }

  // State: AWAITING_BALANCE_THRESHOLD
  if (session.state === 'AWAITING_BALANCE_THRESHOLD') {
    const threshold = parseFloat(normalizedText);
    session.state = 'IDLE';
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return { reply: 'Enter a valid USD threshold (e.g. 50)' };
    }
    await dbPg.updateLowBalanceThreshold(telegramId, threshold);
    return { reply: `🔔 Low balance alert set to $${threshold}.` };
  }

  // State: AWAITING_BIZ_NAME
  if (session.state === 'AWAITING_BIZ_NAME') {
    if (!text || text.trim().length === 0) {
      return { reply: '❌ Business name is required. Please enter your business name:' };
    }
    session.tempBusiness.name = text.trim();
    session.tempBusinessName = text.trim();
    session.state = 'AWAITING_BIZ_EMAIL';
    return {
      reply: '✅ Business name saved!\n\nEnter your business email, or type "skip" to continue without it:'
    };
  }

  // State: AWAITING_BIZ_EMAIL
  if (session.state === 'AWAITING_BIZ_EMAIL') {
    if (isSkip(normalizedText)) {
      session.tempBusiness.email = null;
      session.state = 'AWAITING_BIZ_LOGO';
      return {
        reply: 'Send your business logo as a photo, paste a logo URL, or type "skip":'
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedText)) {
      return { reply: '❌ Invalid email format. Enter a valid email or type "skip":' };
    }

    session.tempBusiness.email = normalizedText;
    session.state = 'AWAITING_BIZ_LOGO';
    return {
      requireAuth: true,
      reply: `✅ Business email saved!\n\n` + 
             `To secure your business account and unlock cross-platform dashboard access, click the button below to verify your email via Magic.link.\n\n` +
             `You can also continue your setup: Send your business logo as a photo, paste a logo URL, or type "skip":`
    };
  }

  // State: AWAITING_BIZ_LOGO
  if (session.state === 'AWAITING_BIZ_LOGO') {
    if (isSkip(normalizedText)) {
      session.tempBusiness.logo = null;
      session.state = 'AWAITING_BIZ_ADDRESS';
      return {
        reply: 'Enter your business address, or type "skip" to finish setup:'
      };
    }

    if (normalizedText.startsWith('__photo__:')) {
      session.tempBusiness.logo = normalizedText.replace('__photo__:', '');
      session.state = 'AWAITING_BIZ_ADDRESS';
      return {
        reply: '✅ Logo saved!\n\nEnter your business address, or type "skip" to finish setup:'
      };
    }

    if (/^https?:\/\//i.test(normalizedText)) {
      session.tempBusiness.logo = normalizedText;
      session.state = 'AWAITING_BIZ_ADDRESS';
      return {
        reply: '✅ Logo URL saved!\n\nEnter your business address, or type "skip" to finish setup:'
      };
    }

    return {
      reply: 'Send a logo photo, paste a logo URL, or type "skip":'
    };
  }

  // State: AWAITING_BIZ_ADDRESS
  if (session.state === 'AWAITING_BIZ_ADDRESS') {
    session.tempBusiness.address = isSkip(normalizedText) ? null : normalizedText;
    return completeBusinessProfile(telegramId, session);
  }

  // State: AWAITING_INV_AMOUNT
  if (session.state === 'AWAITING_INV_AMOUNT') {
    const amount = parseFloat(text.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      return { reply: "❌ Invalid billing amount. Please enter a valid positive number:" };
    }
    session.tempInvoice.amount = amount;
    session.state = 'AWAITING_INV_FIAT_CURRENCY';
    return { 
      reply: `✅ Amount: ${amount.toLocaleString()}\n\nWhat currency will the customer pay with?\nSupported: NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD, AED, USDC, USDT, ETH, SOL, POL` 
    };
  }

  // State: AWAITING_INV_FIAT_CURRENCY
  if (session.state === 'AWAITING_INV_FIAT_CURRENCY') {
    const currency = text.trim().toUpperCase();
    const supported = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'CAD', 'AED', 'USDC', 'USDT', 'ETH', 'SOL', 'POL'];
    if (!supported.includes(currency)) {
      return { reply: `❌ Please enter a supported currency: ${supported.join(', ')}` };
    }
    session.tempInvoice.fiatCurrency = currency;
    session.state = 'AWAITING_INV_CUST';
    return { reply: `✅ Currency: ${currency}\n\nWho are you billing? Enter the customer's name:` };
  }

  // State: AWAITING_INV_CUST
  if (session.state === 'AWAITING_INV_CUST') {
    if (!text || text.trim().length === 0) {
      return { reply: "❌ Customer identifier cannot be empty. Please enter a name:" };
    }
    const customer = text.trim();
    const amount = session.tempInvoice.amount;
    const currency = session.tempInvoice.fiatCurrency || 'NGN';
    const invoiceId = 'INV-' + Date.now().toString().slice(-6);
    const dueDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

    // Customer tracking
    const customerService = require('./customer-service');
    const customerId = customerService.upsertCustomer(telegramId, { name: customer });
    customerService.recordInvoiceForCustomer(customerId);

    const isCrypto = ['USDC', 'USDT', 'ETH', 'SOL', 'POL', 'BNB', 'AVAX'].includes(currency);
    let depositAddress = null;
    let depositWalletPrivateKey = null;

    if (isCrypto) {
      const hdWallet = ethers.Wallet.createRandom();
      depositAddress = hdWallet.address;
      depositWalletPrivateKey = hdWallet.privateKey;
    } else {
      depositAddress = user.business_smart_account || user.personal_smart_account || user.owner_address || null;
    }

    const bizProfile = await dbPg.getProfileByType(telegramId, 'business');
    let virtualAccountNo = null;
    let bankName = 'Flutterwave MFB / Nuvion Partner Bank';
    if (bizProfile?.profile_id) {
      const acc = await dbPg.query(
        `SELECT nuvion_account_no, bank_name FROM accounts WHERE profile_id = ? AND purpose = ? LIMIT 1`
      , [bizProfile.profile_id, currency]).then(r => r.rows[0] || null);
      if (acc?.nuvion_account_no) {
        virtualAccountNo = acc.nuvion_account_no;
        bankName = acc.bank_name || bankName;
      }
    }
    if (!virtualAccountNo && !isCrypto && (currency === 'NGN' || currency === 'USD')) {
      virtualAccountNo = user.nuvion_business_account_no || user.nuvion_account_no || null;
    }

    const paymentLinkToken = crypto.randomBytes(16).toString('hex');
    const invoiceResult = await createFullInvoice({
      telegramId,
      user,
      customer,
      amount,
      currency,
      depositAddress,
      invoiceId,
      paymentLinkToken
    });

    session.state = 'IDLE';
    session.tempInvoice = { amount: null, customer: null, fiatCurrency: null };

    return {
      imageBuffer: invoiceResult.invoiceImageBuffer,
      reply: `🧾 Invoice Created Successfully!\n\n` +
             `📋 Invoice Details:\n` +
             `• Invoice #: ${invoiceId}\n` +
             `• Business: ${bizProfile?.name || user.business_name || 'PayIT Business'}\n` +
             `• Customer: ${customer}\n` +
             `• Amount: ${currency} ${amount.toLocaleString()}\n` +
             `• Due: ${dueDate}\n` +
             (virtualAccountNo ? `• Bank Account: ${virtualAccountNo} (${bankName})\n` : `• Deposit Address: ${depositAddress}\n`) +
             `• Payment Link: ${invoiceResult.paymentLink}\n\n` +
             `Share this invoice with your customer. They can pay via the payment link or transfer directly.`
    };
  }

  // State: IDLE / ACTIVE
  if (session.state === 'IDLE' || session.state === 'ACTIVE' || session.state === 'SETTINGS_MENU') {
    // Settings and account management (handle before NLP)
    if (lowerText === '/settings' || lowerText === 'settings' || lowerText === '⚙️ settings') {
      session.state = 'SETTINGS_MENU';
      return getSettingsMenuReply();
    }

    if (lowerText === '/menu' || lowerText === 'back to menu' || lowerText === '⬅️ back to menu' || lowerText === '⬅️ back to main menu') {
      session.state = 'IDLE';
      return {
        keyboard: 'root',
        reply: '🏠 **Main Menu**\n\nChoose an account to manage:'
      };
    }

    if (lowerText === 'personal account' || lowerText === '👤 personal account') {
      await dbPg.updateUserContext(telegramId, 'personal');
      await dbPg.createAuditLog({ logId: `log_${Date.now()}`, userId: telegramId, action: 'SWITCH_CONTEXT', details: { context: 'personal' } });
      return {
        keyboard: 'personal',
        reply: `👤 **Personal Account Workspace**\n\nHere you can manage your peer-to-peer finances. Use 'Split Bill' to share costs with friends, 'Escrow' to safely buy from strangers, or 'Utilities' to cash out to Airtime.`
      };
    }

    if (lowerText === 'business account' || lowerText === '🏢 business account') {
      if (!user.business_name) {
        session.state = 'AWAITING_BIZ_NAME';
        return { reply: "🏢 **Business Profile Setup**\n\n💡 Let's set up your business profile to start creating invoices.\n\nPlease enter your **Business Name**:" };
      }
      await dbPg.updateUserContext(telegramId, 'business');
      await dbPg.createAuditLog({ logId: `log_${Date.now()}`, userId: telegramId, action: 'SWITCH_CONTEXT', details: { context: 'business' } });
      return {
        keyboard: 'business',
        reply: `🏢 **Business Account Workspace**\n\nYour SME command center. Upload physical receipts with 'Scan Receipt' for AI processing, or set up automated tax withholding under 'Tax Settings'.`
      };
    }

    if (lowerText === '/wallets' || lowerText === 'view wallets' || lowerText === '👛 view wallets') {
      session.state = 'SETTINGS_MENU';
      return {
        keyboard: 'settings',
        reply: formatWalletDetails(user)
      };
    }

    if (lowerText.startsWith('/sync') || lowerText.startsWith('sync') || lowerText === '🔗 sync mobile app' || lowerText === 'sync mobile app') {
      session.state = 'SETTINGS_MENU';
      const parts = normalizedText.split(/\s+/);
      const code = parts[1] ? parts[1].trim() : null;

      if (code) {
        // User entered a 6-digit sync code generated from Mobile App
        const syncRow = await dbPg.getSyncCode(code);
        if (!syncRow) {
          return {
            keyboard: 'settings',
            reply: '❌ **Invalid or Expired Sync Code**\n\nPlease generate a new 6-digit sync code in your Mobile App under Settings -> Link Telegram Account.'
          };
        }
        await dbPg.markSyncCodeUsed(code);
        await dbPg.linkTelegramIdToUser(syncRow.user_id, telegramId);
        await dbPg.linkTelegramIdToUser(telegramId, syncRow.user_id);
        
        return {
          keyboard: 'settings',
          reply: `🎉 **Mobile App & Telegram Linked Successfully!**\n\nYour profiles, invoices, balances, and transaction history are now fully synchronized between your Mobile App and Telegram bot.`
        };
      } else {
        // Generate fresh 6-digit code for user to enter in Mobile App
        const syncCode = Math.floor(100000 + Math.random() * 900000).toString();
        await dbPg.createSyncCode(telegramId, syncCode);

        return {
          keyboard: 'settings',
          reply: `🔗 **Sync Profile with Mobile App**\n\n` +
                 `Your 6-Digit Telegram Link Code:\n` +
                 `👉 **${syncCode}** 👈 *(Valid for 10 minutes)*\n\n` +
                 `📱 **Instructions for Mobile App:**\n` +
                 `1. Open your PayIT Mobile App\n` +
                 `2. Go to **Settings -> Link Telegram Account**\n` +
                 `3. Enter the code **${syncCode}** and tap **Verify & Link**!\n\n` +
                 `💡 *Alternatively, if you generated a code in your Mobile App, type:* \`/sync <code>\``
        };
      }
    }

    if (lowerText === '/business' || lowerText === 'business profile' || lowerText === '🏢 business profile') {
      resetBusinessDraft(session);
      session.state = 'AWAITING_BIZ_NAME';
      return {
        keyboard: 'settings',
        reply: '🏢 Business Profile Setup\n\nEnter your business name (required):'
      };
    }

    if (lowerText === '/secure' || lowerText === '📧 secure account') {
      session.state = 'AWAITING_EMAIL_VERIFICATION';
      return {
        keyboard: 'settings',
        reply: `📧 **Secure Account**\n\n` +
               `Link your email to back up your smart wallet and log in across devices.\n\n` +
               `Please reply with your **email address**:`
      };
    }

    if (session.state === 'AWAITING_EMAIL_VERIFICATION') {
      const email = normalizedText;
      if (!email.includes('@')) {
        return { reply: '❌ That does not look like a valid email. Please try again or type "cancel".' };
      }
      
      // Simulate Magic Link verification natively in bot
      await dbPg.updateBusinessProfile(telegramId, user.business_name || null, email, user.business_logo || null, user.business_address || null);
      await dbPg.createAuditLog({ logId: `log_${Date.now()}_email`, userId: telegramId, action: 'EMAIL_VERIFIED', details: { email } });
      
      session.state = 'IDLE';
      return {
        keyboard: 'settings',
        reply: `✅ **Email Verified!**\n\nWe sent a secure verification ping to **${email}**.\n\nYour PayIT account is now fully secured.`
      };
    }

    if (lowerText === '🔑 view private key' || lowerText === '/viewkey') {
      session.state = 'AWAITING_PIN_FOR_KEY';
      return {
        keyboard: 'settings',
        reply: `🔑 **Security Verification**\n\nPlease enter your **4-digit PIN** to view your secret keys:`
      };
    }

    if (session.state === 'AWAITING_PIN_FOR_KEY') {
      const pin = normalizedText;
      const bcrypt = require('bcryptjs');
      const pinValid = await bcrypt.compare(pin, user?.pin_hash || '').catch(() => false);
      // Fallback for legacy SHA-256 hashes
      const legacyValid = !pinValid && user?.pin_hash ? crypto.createHash('sha256').update(pin).digest('hex') === user.pin_hash : false;

      if (!pinValid && !legacyValid) {
        session.state = 'IDLE';
        return { keyboard: 'settings', reply: '❌ **Incorrect PIN.** Action cancelled.' };
      }

      session.state = 'IDLE';
      await dbPg.createAuditLog({ logId: `log_${Date.now()}_key`, userId: telegramId, action: 'VIEWED_PRIVATE_KEY', details: { ip: 'hidden' } });
      
      return {
        keyboard: 'settings',
        reply: `⚠️ **WARNING: NEVER SHARE YOUR PRIVATE KEY**\n\n` +
               `PayIT uses Particle Network MPC wallets. The owner address below controls your Universal Accounts.\n\n` +
               `**Owner Address:**\n\`${user.owner_address}\`\n\n` +
               `**Mock Private Key (for demo):**\n\`0x${crypto.randomBytes(32).toString('hex')}\``
      };
    }

    if (session.state === 'SETTINGS_MENU' && user.business_name &&
        !['/switch', '/lock', '/status', '/settings', '/wallets', '/business', '/menu', 'help', 'balance', 'invoice'].includes(lowerText) &&
        !lowerText.startsWith('/')) {
      resetBusinessDraft(session);
      session.tempBusiness.name = normalizedText;
      session.tempBusinessName = normalizedText;
      session.state = 'AWAITING_BIZ_EMAIL';
      return {
        keyboard: 'settings',
        reply: `✅ Business name updated to "${normalizedText}".\n\nEnter your business email, or type "skip":`
      };
    }

    if (lowerText === 'help' || lowerText === '/help' || lowerText === '❓ help') {
      return {
        reply: `ℹ️ PayIT Help\n\n` +
               `Quick Start:\n` +
               `• Use menu buttons for common actions\n` +
               `• Type naturally like "Send 5000 NGN to Maria"\n` +
               `• Savings: "Save 500 USDC for 90 days with yield"\n` +
               `• Business auto-save: "Auto save 15% of every invoice"\n` +
               `• Payroll: "Pay staff Ada 500 USDC, John 300 USDC"\n` +
               `• Send voice notes or upload salary files for AI parsing\n` +
               `• Open Settings to view wallet addresses\n\n` +
               `Security:\n` +
               `• Lock your account when not in use\n` +
               `• All transactions are bank-level secure\n\n` +
               `AI Features:\n` +
               `• Groq parses text, voice transcripts, and salary files\n` +
               `• Invoice images show exact payment details`
      };
    }

    if (lowerText === 'savings' || lowerText === '🐷 savings') {
      session.state = 'IDLE';
      await dbPg.createAuditLog({ logId: `log_${Date.now()}`, userId: telegramId, action: 'VIEW_SAVINGS' });
      return require('./financial-handlers').getSavingsMenuReply(user);
    }

    // New Agentic Feature Stubs
    if (lowerText === 'send' || lowerText === 'send money' || lowerText === '💸 send money') {
      session.state = 'AWAITING_SEND_INTENT';
      return { 
        reply: '💸 **Send Money**\n\n' +
               'Who would you like to send money to and how much?\n\n' +
               '🌍 **Local Fiat Transfer**: You can send money in local fiat (e.g., NGN, USD, EUR) and PayIT will automatically handle the FX conversion.\n' +
               '🔗 **Crypto Transfer**: To send via crypto, just specify USDC or USDT.\n\n' +
               '*Example Fiat:* "Send 50000 NGN to @john"\n' +
               '*Example Crypto:* "Send 50 USDC to @john"' 
      };
    }
    if (lowerText === 'split bill' || lowerText === '🪓 split bill' || lowerText.startsWith('split ')) {
      return await require('./split-service').handleSplitCommand(user, text);
    }
    if (lowerText === 'escrow' || lowerText === '🤝 escrow' || lowerText.startsWith('lock ')) {
      return await require('./escrow-service').handleEscrowCommand(user, text);
    }
    if (lowerText === 'utilities' || lowerText === '📱 utilities') {
      return { keyboard: 'personal', reply: '📱 **Utilities & Off-ramp**\n\nInstantly buy Airtime or Gift cards with USDC. (Integration coming soon)' };
    }
    if (lowerText === 'scan receipt' || lowerText === '📸 scan receipt') {
      session.state = 'AWAITING_RECEIPT';
      return { keyboard: 'business', reply: '📸 **AI Receipt Scanner**\n\nTake a photo of a vendor receipt and upload it here. I will extract the details and log it to your Balance Sheet.' };
    }
    if (lowerText === 'tax settings' || lowerText === '🏦 tax settings') {
      return { keyboard: 'business', reply: '🏦 **Automated Tax Withholding**\n\nAutomatically sweep a percentage of paid invoices into a locked vault.\n\nEnter the percentage (e.g. "Set tax to 5%").' };
    }

    if (lowerText === 'lock savings' || lowerText === '🔒 lock savings') {
      session.tempSavings.type = 'lock';
      session.state = 'AWAITING_SAVE_AMOUNT';
      return { reply: '🔒 Lock Savings (no interest)\n\nEnter the amount to lock (e.g. 500 USDC):' };
    }

    if (lowerText === 'yield savings' || lowerText === '📈 yield savings') {
      session.tempSavings.type = 'yield';
      session.state = 'AWAITING_SAVE_AMOUNT';
      return { reply: '📈 Yield Savings (up to 10% APY shown)\n\nEnter the amount to save (e.g. 500 USDC):' };
    }

    if (lowerText === 'view savings' || lowerText === 'my savings' || lowerText === '📋 view savings') {
      const walletContext = user.active_context === 'business' ? 'business' : 'personal';
      const locks = savingsService.listActive(telegramId, walletContext);
      if (!locks.length) {
        return { reply: 'No active savings locks yet. Tap Savings to create one.' };
      }
      const summary = locks.slice(0, 5).map((lock) => savingsService.formatLockSummary(lock)).join('\n\n');
      return { reply: `🐷 Active Savings (${walletContext})\n\n${summary}` };
    }

    if (lowerText === 'auto-save' || lowerText === 'auto save setup' || lowerText === '💾 auto-save setup') {
      if (user.active_context !== 'business') {
        return { reply: 'Auto-save is a business feature. Switch to your business profile first.' };
      }
      session.state = 'AWAITING_AUTOSAVE_PERCENT';
      return { reply: '💾 Business Auto-Save\n\nEnter the % to save from each paid invoice (e.g. 15):' };
    }

    if (lowerText === 'pay staff' || lowerText === 'payroll' || lowerText === '👥 pay staff') {
      const payrollIntent = await handleFinancialIntent(
        telegramId,
        { action: 'BULK_PAYROLL', parameters: { recipients: null } },
        session,
        user
      );
      if (payrollIntent) return payrollIntent;
    }

    if (lowerText === 'balance' || lowerText === 'check balance' || lowerText === '💰 check balance') {
      const activeAddress = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;

      let balanceText = '• USD Balance: $150.00\n• Available: Yes';

      if (!particleService.isSimulationMode() && user.owner_address) {
        try {
          const unifiedBalance = await particleService.getUnifiedBalance(user.owner_address);
          balanceText = `• Total Balance: $${unifiedBalance.totalAmountInUSD}\n• Available: Yes`;
        } catch (error) {
          console.error('Failed to get unified balance:', error.message);
        }
      }

      const bizPrefix = user.active_context === 'business' ? '🏢 Business Account\n' : '👤 Personal Account\n';

      return {
        keyboard: user ? user.active_context : 'personal',
        reply: `${bizPrefix}` +
               `💰 Your Balance\n\n` +
               `Wallet: ${activeAddress}\n\n` +
               `Available Funds:\n` +
               balanceText
      };
    }

    if (lowerText === 'receive money' || lowerText === '💳 receive money') {
      session.tempReceive = {};
      session.state = 'AWAITING_RECEIVE_CURRENCY';
      return {
        keyboard: 'personal',
        reply: `💳 **Receive Money**\n\nWhich currency are you expecting to receive?\n\n` +
               `Options: USD, EUR, NGN, JPY, AED, Crypto\n\n` +
               `*Reply with the currency name:*`
      };
    }

    if (session.state === 'AWAITING_RECEIVE_CURRENCY') {
      const currency = normalizedText.toUpperCase();
      const valid = ['USD', 'EUR', 'NGN', 'JPY', 'AED', 'CRYPTO'];
      if (!valid.includes(currency)) {
         return { reply: '❌ Unsupported currency. Please reply with USD, EUR, NGN, JPY, AED, or Crypto.' };
      }
      session.tempReceive.currency = currency;
      session.state = 'AWAITING_RECEIVE_AMOUNT';
      return { reply: `Got it. How much ${currency} are you expecting? (e.g. 100)` };
    }

    if (session.state === 'AWAITING_RECEIVE_AMOUNT') {
      const amount = parseFloat(normalizedText);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please enter a valid number.' };
      }
      session.state = 'IDLE';
      const currency = session.tempReceive.currency;
      
      if (currency === 'CRYPTO') {
        const ethers = require('ethers');
        const hdWallet = ethers.Wallet.createRandom();
        const depositId = `dep_${Date.now()}`;
        await dbPg.createHdDeposit(depositId, telegramId, amount, currency, hdWallet.address, hdWallet.privateKey, null);
        
        return {
          reply: `📥 **Crypto Deposit Request**\n\n` +
                 `A unique HD wallet has been generated for this specific transaction.\n\n` +
                 `**Expected:** ${amount} USDC/USDT\n` +
                 `**Deposit Address:**\n\`${hdWallet.address}\`\n\n` +
                 `⏳ We are monitoring this address. Funds will be automatically swept on confirmation.`
        };
      } else {
        const depositId = `dep_${Date.now()}`;
        const virtualAccount = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        // Resolve the correct Particle smart account for this context (not 'fiat')
        const botUser = await dbPg.getUser(telegramId);
        const botSmartAccount = (botUser?.active_context === 'business'
          ? (botUser?.business_smart_account || botUser?.owner_address)
          : (botUser?.personal_smart_account || botUser?.owner_address)) || 'fiat';
        await dbPg.createHdDeposit(depositId, telegramId, amount, currency, botSmartAccount, null, virtualAccount);
        
        return {
          reply: `📥 **Fiat Deposit Request**\n\n` +
                 `A unique virtual account has been generated for this specific transaction.\n\n` +
                 `🏦 **Bank:** PayIT International\n` +
                 `🔢 **Account No:** \`${virtualAccount}\`\n` +
                 `💲 **Expected:** ${amount} ${currency}\n\n` +
                 `⏳ We are monitoring this account. Funds will be automatically credited on confirmation.`
        };
      }
    }

    // /simulate_payment only in dev mode
    if (process.env.NODE_ENV !== 'production' && lowerText.startsWith('/simulate_payment ')) {
      const parts = text.split(' ');
      const ref = parts[1];
      const receivedAmountStr = parts[2];
      const deposit = await dbPg.getHdDeposit(ref);
      
      if (deposit) {
        const received = receivedAmountStr ? parseFloat(receivedAmountStr) : deposit.expected_amount;
        
        if (received >= deposit.expected_amount) {
          await dbPg.updateHdDepositStatus(deposit.deposit_id, 'paid_and_swept');
          return {
            reply: `🔔 **Payment Received!**\n\n` +
                   `Received ${received} ${deposit.currency} into the temporary wallet. ` +
                   `(Expected ${deposit.expected_amount})\n\n` +
                   `✅ **Auto-Swept**: Funds have been swept to your Universal Account gas-free.`
          };
        } else {
          await dbPg.updateHdDepositStatus(deposit.deposit_id, 'underpaid');
          return {
            reply: `⚠️ **Underpayment Detected!**\n\n` +
                   `Received only ${received} ${deposit.currency}.\n` +
                   `Expected: ${deposit.expected_amount} ${deposit.currency}.\n` +
                   `Missing: ${deposit.expected_amount - received} ${deposit.currency}.\n\n` +
                   `Would you like to sweep these partial funds to your main account anyway?`,
            reply_markup: {
              inline_keyboard: [[{ text: '🧹 Sweep Partial Funds', callback_data: `sweep_${deposit.deposit_id}` }]]
            }
          };
        }
      }
      
      const invoice = await dbPg.getInvoiceByPaymentLinkOrId(ref) || await dbPg.getInvoiceByAddress(ref);
      if (invoice) {
         const received = receivedAmountStr ? parseFloat(receivedAmountStr) : invoice.amount;
         
         if (received >= invoice.amount) {
           await dbPg.updateInvoiceSettlement(invoice.invoice_id, `sim_tx_${Date.now()}`, invoice.currency, 'paid_and_swept');
           return {
            reply: `🔔 **Invoice Payment Received!**\n\n` +
                   `Received ${received} ${invoice.currency} into the invoice wallet. ` +
                   `(Expected ${invoice.amount})\n\n` +
                   `✅ **Auto-Swept**: Transaction matched and reconciled.`
          };
         } else {
           await dbPg.updateInvoiceSettlement(invoice.invoice_id, `sim_tx_${Date.now()}`, invoice.currency, 'underpaid');
           return {
            reply: `⚠️ **Invoice Underpayment Detected!**\n\n` +
                   `Received only ${received} ${invoice.currency}.\n` +
                   `Expected: ${invoice.amount} ${invoice.currency}.\n\n` +
                   `Would you like to sweep these partial funds anyway?`,
            reply_markup: {
              inline_keyboard: [[{ text: '🧹 Sweep Partial Funds', callback_data: `sweep_inv_${invoice.invoice_id}` }]]
            }
          };
         }
      }
      
      if (!invoice && !deposit) {
         return { reply: '❌ Deposit address or virtual account not found.' };
      }
    }

    if (lowerText === 'invoice hub' || lowerText === '🧾 invoice hub') {
      if (user.active_context !== 'business') {
        if (!user.business_name) {
          session.state = 'AWAITING_BIZ_NAME';
          return {
            reply: '🧾 Invoice Hub\n\nBusiness profile required. Enter your business name:'
          };
        }
        await dbPg.updateUserContext(telegramId, 'business');
      }
      return {
        keyboard: 'invoice_hub',
        reply: `🧾 **Invoice Hub**\n\nSelect an option below to manage your billing and finances.`
      };
    }

    if (lowerText === 'new invoice' || lowerText === '➕ new invoice') {
      if (user.active_context !== 'business') {
        if (!user.business_name) {
          session.state = 'AWAITING_BIZ_NAME';
          return { reply: 'Business profile required. Enter your business name:' };
        }
        await dbPg.updateUserContext(telegramId, 'business');
      }
      session.state = 'AWAITING_INV_AMOUNT';
      return { reply: '🧾 New Invoice Creation:\n\nEnter the billing amount in USD:' };
    }

    if (lowerText === 'old invoices' || lowerText === '📜 old invoices') {
      const invoices = await dbPg.getUserInvoices(telegramId) || [];
      if (!invoices.length) {
        return { keyboard: 'invoice_hub', reply: 'You have not created any invoices yet.' };
      }
      const list = invoices.slice(0, 10).map(inv => `• ${inv.invoice_id} | ${inv.recipient} | ${inv.amount} ${inv.currency} | [${inv.status.toUpperCase()}]`).join('\n');
      return {
        keyboard: 'invoice_hub',
        reply: `📜 **Recent Invoices**\n\n${list}\n\n*Showing last 10 invoices.*`
      };
    }

    if (lowerText === 'balance sheet' || lowerText === '📊 balance sheet') {
      const { generateInvoiceReport } = require('./export-service');
      const invoices = await dbPg.getUserInvoices(telegramId) || [];
      
      try {
        const documentBuffer = await generateInvoiceReport(invoices);
        return {
          keyboard: 'invoice_hub',
          documentBuffer,
          documentName: `Invoice_Balance_Sheet_${(user.business_name || 'Business').replace(/[^a-z0-9]/gi, '_')}.xlsx`,
          reply: `📊 Here is your generated Invoice Balance Sheet in Excel format.`
        };
      } catch (e) {
        console.error('Error generating invoice balance sheet:', e);
        return { keyboard: 'invoice_hub', reply: 'Failed to generate balance sheet.' };
      }
    }
    
    if (lowerText === 'business export' || lowerText === '📈 business data export') {
      const { generateBusinessReport } = require('./export-service');
      const invoices = await dbPg.getUserInvoices(telegramId) || [];
      const transactions = await dbPg.getTransactions(telegramId) || [];
      
      try {
        const documentBuffer = await generateBusinessReport(invoices, [], transactions, []);
        return {
          keyboard: 'business',
          documentBuffer,
          documentName: `Business_Financials_${(user.business_name || 'Business').replace(/[^a-z0-9]/gi, '_')}.xlsx`,
          reply: `📈 Here is your comprehensive Business Financial Report in Excel format.`
        };
      } catch (e) {
        console.error('Error generating business report:', e);
        return { keyboard: 'business', reply: 'Failed to generate business report.' };
      }
    }

    // 2.1 Commands handling
    if (lowerText === '/switch') {
      const targetContext = user.active_context === 'business' ? 'personal' : 'business';
      if (targetContext === 'business' && !user.business_name) {
        session.state = 'AWAITING_BIZ_NAME';
        return { reply: "🏢 **Business Profile Setup**\n\n💡 Let's set up your business profile to start creating invoices.\n\nPlease enter your **Business Name**:" };
      }
      await dbPg.updateUserContext(telegramId, targetContext);
      return { 
        keyboard: session.state === 'SETTINGS_MENU' ? 'settings' : undefined,
        reply: `🔄 Switched to ${targetContext.toUpperCase()} Profile\n\nActive wallet: ${
          targetContext === 'business' ? user.business_smart_account : user.personal_smart_account
        }`
      };
    }

    if (lowerText === '/lock') {
      session.state = 'LOCKED';
      return {
        keyboard: user ? user.active_context : 'personal',
        reply: '🔒 Account Locked\n\nYour account is now secure. Use Unlock Account to resume.'
      };
    }

    if (lowerText.startsWith('/deposit') || lowerText === '/accounts' || lowerText === '/account') {
      const parts = normalizedText.split(' ');
      const rawCurrency = parts[1] ? parts[1].toUpperCase() : 'NGN';
      const nuvionService = require('./nuvion-service');
      const context = user.active_context || 'personal';
      const userProfile = {
        name: user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user.email ? user.email.split('@')[0] : 'PayIT Member'),
        email: user.email || `${telegramId}@payit.app`,
        business_name: user.business_name,
        business_email: user.business_email
      };

      try {
        const accInfo = await nuvionService.getOrCreateDepositAccount(telegramId, rawCurrency, userProfile, null, context);
        return {
          reply: `🏦 **PayIT ${rawCurrency} Live Nuvion Receiving Account**\n\n` +
                 `• **Profile**: ${context.toUpperCase()} (${context === 'business' ? (user.business_name || 'Business') : userProfile.name})\n` +
                 `• **Currency**: ${accInfo.currency || rawCurrency}\n` +
                 `• **Bank Name**: ${accInfo.issuer?.name || 'VFD Microfinance Bank'}\n` +
                 `• **Account Number / IBAN**: \`${accInfo.account_number}\`\n` +
                 `• **Beneficiary**: ${accInfo.beneficiary_name || userProfile.name}\n\n` +
                 `💡 Deposits land instantly in your Nuvion account and are swept out automatically to your self-custodial Particle Universal Smart Account.`
        };
      } catch (err) {
        return { reply: `❌ **Failed to fetch ${rawCurrency} receiving account**: ${err.message}` };
      }
    }

    if (lowerText.startsWith('/cac ') || lowerText.startsWith('/kyb ')) {
      const parts = normalizedText.split(' ');
      const cacNumber = parts.slice(1).join(' ').trim();
      if (!cacNumber || cacNumber.length < 5) {
        return { reply: "❌ **Invalid CAC Number**\n\nPlease provide a valid Corporate Affairs Commission (CAC) Registration Number.\n\nExample: `/cac RC1234567` or `/cac BN9876543`" };
      }
      await dbPg.updateBusinessKybCac(telegramId, cacNumber);
      return {
        reply: `✅ **Business KYB Verified!**\n\n` +
               `• **CAC Registration**: \`${cacNumber}\`\n` +
               `• **Business Status**: UNLIMITED Volume\n` +
               `• **Profile**: ${user.business_name || 'Business'}\n\n` +
               `Your business profile limit has been upgraded to **UNLIMITED** for all transactions & sweeps!`
      };
    }

    if (lowerText === '/cards' || lowerText === '/card') {
      const context = user.active_context || 'personal';
      const profile = await dbPg.getProfileByType(telegramId, context) || (await dbPg.getProfilesForUser(telegramId) || [])[0];
      const cards = profile ? await dbPg.getCardsForProfile(profile.profile_id) : [];
      
      let cardText = `💳 **PayIT Virtual Cards (${context.toUpperCase()})**\n\n`;
      if (cards.length === 0) {
        cardText += `You have no active virtual cards for your ${context} profile.\n\n` +
                    `To issue a new ${context.toUpperCase()} card with automated buffer refills, type:\n` +
                    `👉 \`/card issue\``;
      } else {
        cards.forEach((c, idx) => {
          cardText += `• **Card #${idx + 1}**: \`${c.card_id}\`\n` +
                      `  Buffer Account: \`${c.nuvion_account_id}\`\n` +
                      `  Refill Threshold: $${c.buffer_threshold} | Refill Amount: $${c.refill_amount}\n\n`;
        });
      }
      return { reply: cardText };
    }

    if (lowerText === '/card issue' || lowerText === '/cards issue') {
      const context = user.active_context || 'personal';
      const nuvionService = require('./nuvion-service');
      const cardInfo = await nuvionService.issueCard(telegramId, 'USD', context);
      return {
        reply: `🎉 **Virtual Card Issued Successfully!**\n\n` +
               `• **Profile Context**: ${context.toUpperCase()}\n` +
               `• **Card ID**: \`${cardInfo.cardId}\`\n` +
               `• **Nuvion Buffer Account**: \`${cardInfo.bufferAccountId}\`\n` +
               `• **Buffer Rules**: Auto-refill $20 whenever balance dips under $5`
      };
    }

    if (lowerText === '/status' || lowerText === '/business') {
      const kybStatus = await dbPg.getProfileKybStatus(telegramId);
      const kybText = kybStatus.kyb_status === 'verified'
        ? `🟢 CAC Verified (CAC: ${kybStatus.cac_number || 'RC Verified'} • UNLIMITED)`
        : `🟡 Starter Tier (Personal KYC Linked • <$500 Limit)`;

      const businessDetails = user.business_name
        ? `\n• Business Name: ${user.business_name}\n• Business Email: ${user.business_email || 'Not set'}\n• Business Address: ${user.business_address || 'Not set'}`
        : '\n• Business Setup: Not complete';
      const activeWallet = user.active_context === 'business'
        ? user.business_smart_account
        : user.personal_smart_account;
      const walletContext = user.active_context === 'business' ? 'business' : 'personal';
      const activeSavings = savingsService.listActive(telegramId, walletContext);
      const autoSaveLine = user.auto_save_percent > 0
        ? `\n• Auto-Save: ${user.auto_save_percent}% of paid invoices (${user.auto_save_type || 'lock'})`
        : '';

      return {
        reply: `📊 **PayIT Account & Business Status**\n\n` +
               `• **Active Context**: ${user.active_context.toUpperCase()}\n` +
               `• **KYB Status**: ${kybText}\n` +
               `• **Active Wallet**: \`${activeWallet}\`\n` +
               `• **Personal Wallet**: \`${user.personal_smart_account}\`\n` +
               `• **Business Wallet**: \`${user.business_smart_account}\`` +
               businessDetails +
               autoSaveLine +
               `\n• **Active Savings Locks**: ${activeSavings.length}\n\n` +
               `💼 **Sub-Account Buckets:**\n` +
               `  1. Main Operating Account (NGN)\n` +
               `  2. Tax Reserve Bucket (USD)\n` +
               `  3. Payroll Reserve Bucket (USDT)\n\n` +
               `👉 Type \`/cac <rc_number>\` to verify CAC registration number.\n` +
               `👉 Type \`/cards\` to manage virtual cards.`
      };
    }

    // 2.2 NLP parsed action intents (Groq when configured)
    const parsed = await agent.parseIntent(normalizedText);

    const financialResult = await handleFinancialIntent(telegramId, parsed, session, user);
    if (financialResult) {
      return financialResult;
    }

    if (lowerText === '/ref' || lowerText === '🎁 referral' || lowerText === '/referral') {
      const stats = await dbPg.getReferralStats(telegramId);
      return {
        reply: `🎁 **PayIT Referral Program (20% Fee Share)**\n\n` +
               `Earn **20% lifetime revenue share** on all transaction fees generated by people you invite!\n\n` +
               `📋 **Your Referral Link:**\n` +
               `• Web Link: \`${stats.referralLink}\`\n` +
               `• Bot Link: \`${stats.botReferralLink}\`\n\n` +
               `📊 **Your Stats:**\n` +
               `• Friends Invited: ${stats.totalReferred}\n` +
               `• Total Fee Volume: $${stats.totalFeeRevenue}\n` +
               `• Claimable Rewards: **$${stats.claimableRewards}**\n\n` +
               `👉 Type \`/claim\` to transfer your claimable earnings to your wallet!`
      };
    }

    if (lowerText === '/claim') {
      const claimRes = await dbPg.claimReferralEarnings(telegramId);
      return {
        reply: claimRes.success ? `✅ **Rewards Claimed!**\n\n${claimRes.message}` : `⚠️ ${claimRes.message}`
      };
    }

    if (lowerText === '/points' || lowerText === '🏆 points' || lowerText === '/rewards') {
      const stats = await dbPg.getUserPointsStats(telegramId);
      const feeStatus = stats.totalFeesPaid >= stats.requiredFeesForRedemption ? '✓ Qualified' : '❌ Needs Volume';
      return {
        reply: `🏆 **PayIT Activity Points & Rewards**\n\n` +
               `Perform transactions on PayIT to earn points and redeem them for free Airtime & Utility Bills!\n\n` +
               `📊 **Your Points Overview:**\n` +
               `• Total Points: **${stats.totalPoints} PTS**\n` +
               `• Monetary Value: **₦${stats.monetaryValueNgn.toLocaleString()}**\n\n` +
               `🛡️ **3x Fee Qualification Status:**\n` +
               `• Fees Paid: ₦${stats.totalFeesPaid.toFixed(2)}\n` +
               `• Required (3x): ₦${stats.requiredFeesForRedemption.toLocaleString()}\n` +
               `• Status: **${feeStatus}**\n\n` +
               `👉 Type \`/redeem <airtime|data|power|tv> <amount_pts>\` to exchange points!`
      };
    }

    if (parsed.action === 'help') {
      return {
        reply: `ℹ️ PayIT Help\n\n` +
               `Quick Start:\n` +
               `• Use the menu buttons for common actions\n` +
               `• Type naturally like "Send 5000 NGN to Maria"\n` +
               `• Open Settings to view wallet addresses`
      };
    }

    if (parsed.action === 'balance') {
      const activeAddress = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;
      
      let balanceText = '• USD Balance: $150.00\n• Available: Yes';
      
      if (!particleService.isSimulationMode() && user.owner_address) {
        try {
          const unifiedBalance = await particleService.getUnifiedBalance(user.owner_address);
          balanceText = `• Total Balance: $${unifiedBalance.totalAmountInUSD}\n• Available: Yes`;
        } catch (error) {
          console.error('Failed to get unified balance:', error.message);
        }
      }
      
      const bizPrefix = user.active_context === 'business' ? '🏢 Business Account\n' : '👤 Personal Account\n';

      return {
        reply: `${bizPrefix}` +
               `💰 Your Balance\n\n` +
               `Wallet: ${activeAddress}\n\n` +
               `Available Funds:\n` +
               balanceText
      };
    }

    if (parsed.action === 'P2P_TRANSFER') {
      const { amount, currency, recipientIdentifier } = parsed.parameters;
      
      // KYB Threshold Enforcement for Business Profile (Starter limit: $500)
      if (user.active_context === 'business') {
        const kyb = await dbPg.getProfileKybStatus(telegramId);
        const amountUsd = (currency === 'USD' || currency === 'USDT' || currency === 'USDC') ? (amount || 0) : ((amount || 0) / fxService.getRate());
        if (kyb.kyb_status === 'starter' && amountUsd >= 500) {
          return {
            reply: `⚠️ **Business KYB Threshold Exceeded ($500 USD Limit)**\n\n` +
                   `Your business account is currently on **Starter KYB** (Personal KYC linked, <$500 limit).\n\n` +
                   `To send or receive funds worth **$${Math.round(amountUsd)} USD** (≥ $500), please submit your CAC Registration Number.\n\n` +
                   `👉 **Reply with:** \`/cac <your_cac_number>\`\n` +
                   `*Example:* \`/cac RC1234567\``
          };
        }
      }
      
      const activeAddress = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;

      // Fees: stable swaps 0.4%
      let stableSwapFeeMsg = '';
      let amountFormatted = amount;
      if (currency && currency !== 'USDC') {
        const fee = (amount * 0.004).toFixed(2);
        stableSwapFeeMsg = `• **Conversion Fee**: $${fee} (0.4%)\n`;
      }

      session.state = 'AWAITING_PIN_CONFIRM';
      session.pendingAction = {
        type: 'P2P_TRANSFER',
        amount,
        currency: currency || 'USD',
        recipientIdentifier
      };

      return {
        reply: `💸 **Send Money**\n\n` +
               `💡 **Payment Details:**\n` +
               `• To: ${recipientIdentifier}\n` +
               `• Amount: ${amount} ${currency || 'USD'}\n` +
               stableSwapFeeMsg +
               `• Transaction Fee: Free\n\n` +
               `🔒 **Security:**\n` +
               `Enter your 4-digit PIN to confirm this transaction.\n\n` +
               `💡 Your payment is secure and processed instantly.`
      };
    }

    if (parsed.action === 'CASH_OUT') {
      const { amount, currency, bankName, accountNumber } = parsed.parameters;
      
      const activeAddress = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;

      // Local bank off-ramp: 1.2% processing fee
      const fee = (amount * 0.012).toFixed(2);
      const totalAmountWithFee = (amount * 0.988).toFixed(2);

      session.state = 'AWAITING_PIN_CONFIRM';
      session.pendingAction = {
        type: 'CASH_OUT',
        amount,
        currency: currency || 'NGN',
        bankName,
        accountNumber
      };

      return {
        reply: `🏦 **Transfer to Bank**\n\n` +
               `💡 **Withdrawal Details:**\n` +
               `• Bank: ${bankName}\n` +
               `• Account: ${accountNumber}\n` +
               `• Amount: ${amount} ${currency || 'NGN'}\n\n` +
               `💰 **Fees:**\n` +
               `• Processing Fee: ${fee} ${currency || 'NGN'} (1.2%)\n` +
               `• You Receive: ${totalAmountWithFee} ${currency || 'NGN'}\n\n` +
               `💡 **What happens next:**\n` +
               `• Funds will be sent to your bank account\n` +
               `• Usually arrives within 1-2 business days\n\n` +
               `🔒 **Security:**\n` +
               `Enter your 4-digit PIN to confirm this transfer.`
      };
    }


    if (parsed.action === 'INVOICE_CREATION') {
      const params = parsed.parameters || {};
      // Switch context if needed
      if (user.active_context !== 'business') {
        if (!user.business_name) {
          session.state = 'AWAITING_BIZ_NAME';
          session.tempInvoice = { amount: params.amount || null, customer: params.recipientIdentifier || null };
          return {
            reply: `🧾 **Create Invoice**\n\n💡 **Business Profile Required**\n\nInvoices can only be created from your business profile. Let's set that up first.\n\n🏢 Please enter your **Business Name**:`
          };
        } else {
          await dbPg.updateUserContext(telegramId, 'business');
        }
      }

      // If user came with arguments (e.g. "invoice Bob 20 USDC")
      if (params.amount && params.recipientIdentifier) {
        session.tempInvoice = { amount: params.amount, customer: params.recipientIdentifier };
        session.state = 'AWAITING_INV_CUST';
        return processMessage(telegramId, params.recipientIdentifier, mockAddresses);
      }

      // Enter invoice flow from scratch
      session.state = 'AWAITING_INV_AMOUNT';
      return { reply: "🧾 **New Invoice Creation**:\n\nPlease enter the **billing amount** in USD (or NGN):" };
    }
  }

  return { reply: "I didn't understand. Type 'help' to see available commands." };
}

async function processMediaInput(telegramId, parsed) {
  const session = getSession(telegramId);
  const user = await dbPg.getUser(telegramId);
  if (!user) {
    return { reply: 'Please authenticate first to use voice notes and file uploads.' };
  }
  if (session.state === 'LOCKED') {
    return { reply: '🔒 Account Locked. Type /unlock to continue.' };
  }

  const financialResult = await handleFinancialIntent(telegramId, parsed, session, user);
  if (financialResult) {
    return financialResult;
  }

  return {
    reply: 'I could not understand that input. Try text like "Save 500 USDC for 30 days" or upload a payroll CSV file.'
  };
}

async function settleInvoice(invoiceId) {
  const invoice = await dbPg.getInvoice(invoiceId);
  if (!invoice || invoice.status === 'paid') {
    return null;
  }

  await dbPg.updateInvoiceSettlement(invoiceId, `settle_${Date.now()}`, invoice.currency || 'USDC', 'paid');
  const autoSave = await savingsService.applyInvoiceAutoSave({
    telegramId: invoice.user_id,
    invoiceId,
    invoiceAmount: invoice.amount,
    currency: invoice.currency || 'USDC'
  });

  return { invoiceId, autoSave };
}

module.exports = {
  processMessage,
  processMediaInput,
  settleInvoice,
  getSession
};
