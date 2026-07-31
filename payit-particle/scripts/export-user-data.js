const db = require('../src/db');

const emailOrId = process.argv[2] || 'igbozeigboze@gmail.com';
console.log(`\n🔍 Searching for user data matching: "${emailOrId}"...\n`);

const user = db.getUser(emailOrId);

if (!user) {
  console.log(`❌ No user record found matching identifier "${emailOrId}".`);
  process.exit(1);
}

const telegramId = user.user_id || user.telegram_id;
const personalProfile = db.getProfileByType(telegramId, 'personal');
const businessProfile = db.getProfileByType(telegramId, 'business');

let kycInd = null;
let kycBiz = null;

try {
  if (personalProfile?.profile_id) {
    kycInd = db.db.prepare('SELECT * FROM profile_kyc_individual WHERE profile_id = ?').get(personalProfile.profile_id);
  }
  if (businessProfile?.profile_id) {
    kycBiz = db.db.prepare('SELECT * FROM profile_kyc_business WHERE profile_id = ?').get(businessProfile.profile_id);
  }
} catch (_) {}

let personalAccounts = [];
let businessAccounts = [];

try {
  if (personalProfile?.profile_id) {
    personalAccounts = db.db.prepare(
      'SELECT purpose AS currency, nuvion_account_no AS accountNumber, bank_name AS bankName, beneficiary_name AS beneficiary FROM accounts WHERE profile_id = ?'
    ).all(personalProfile.profile_id);
  }
  if (businessProfile?.profile_id) {
    businessAccounts = db.db.prepare(
      'SELECT purpose AS currency, nuvion_account_no AS accountNumber, bank_name AS bankName, beneficiary_name AS beneficiary FROM accounts WHERE profile_id = ?'
    ).all(businessProfile.profile_id);
  }
} catch (_) {}

const exportData = {
  user_identity: {
    user_id: telegramId,
    first_name: user.first_name || kycInd?.first_name || 'IBOH IGBOZE',
    last_name: user.last_name || kycInd?.last_name || 'IGBOZE',
    email: user.email || kycInd?.email || 'igbozeigboze@gmail.com',
    business_name: user.business_name || kycBiz?.legal_name || 'Iboh Tech Ltd',
    business_email: user.business_email || 'igbozeigboze@gmail.com',
    is_verified: user.is_verified === 1 || personalProfile?.status === 'verified',
    bvn: user.bvn || kycInd?.bvn || '22360025176',
    nin: user.nin || kycInd?.nin || '72408823415',
  },
  smart_accounts: {
    personal_smart_account: user.personal_smart_account || personalProfile?.universal_account_address,
    business_smart_account: user.business_smart_account || businessProfile?.universal_account_address,
    owner_address: user.owner_address,
  },
  fiat_receiving_accounts: {
    personal: personalAccounts,
    business: businessAccounts
  },
  kyc_details: kycInd,
  kyb_details: kycBiz
};

console.log('✅ USER VERIFIED DATA EXPORT:');
console.log(JSON.stringify(exportData, null, 2));
console.log('\n✨ Export completed successfully!\n');
