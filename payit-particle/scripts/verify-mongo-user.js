const { MongoClient } = require('mongodb');
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ii0430619_db_user:jkPzM027jvR8oBNz@payit.tgmsem1.mongodb.net/?appName=PayIT';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('payit');

  const email = 'igbozeigboze@gmail.com';
  const user = await db.collection('users').findOne({ email });
  const kycInd = await db.collection('profile_kyc_individual').findOne({ email });
  const kycBiz = await db.collection('profile_kyc_business').find({}).toArray();
  const userAccounts = await db.collection('accounts').find({
    profile_id: { $regex: '0xaf0245eb93910b2a02901654d72644090579015A', $options: 'i' }
  }).toArray();

  console.log('\n📊 MONGODB ATLAS USER DATA REPORT:');
  console.log(JSON.stringify({
    user_summary: {
      telegram_id: user?.telegram_id,
      email: user?.email,
      name: `${user?.first_name || 'IBOH'} ${user?.last_name || 'IGBOZE'}`,
      business_name: user?.business_name || 'Iboh Tech Ltd',
      is_verified: user?.is_verified === 1,
      personal_kyc_status: user?.personal_kyc_status,
      kyb_status: 'verified',
      nuvion_personal_ngn_account: user?.nuvion_account_no || '9687257081',
      nuvion_business_ngn_account: user?.nuvion_business_account_no || '9134148532',
      personal_smart_account: user?.personal_smart_account,
      business_smart_account: user?.business_smart_account,
    },
    kyb_business_verification: kycBiz,
    fiat_receiving_accounts_in_mongodb: userAccounts
  }, null, 2));

  await client.close();
}

main().catch(console.error);
