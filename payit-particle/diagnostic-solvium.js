#!/usr/bin/env node
require('dotenv').config();
const dbModule = require('./src/db');
const { db } = dbModule;
const axios = require('axios');

async function run() {
  console.log('\n' + '='.repeat(90));
  console.log('🔍 DIAGNOSTIC: Solvium Games Ltd Account Root Cause Analysis');
  console.log('Target: igbozeigboze@gmail.com');
  console.log('='.repeat(90) + '\n');

  try {
    // ═══ STEP 1: FIND USERS ════════════════════════════════════════════════
    console.log('STEP 1: Database - Finding all users...\n');
    const allUsers = db.prepare(`SELECT * FROM users LIMIT 50`).all();
    
    let targetUser = null;
    for (const user of allUsers) {
      if ((user.business_email && user.business_email.includes('igboze')) ||
          (user.first_name && user.first_name.toLowerCase().includes('igboze')) ||
          (user.business_name && user.business_name.toLowerCase().includes('igboze'))) {
        targetUser = user;
        console.log(`✅ FOUND USER MATCHING "igboze":\n`);
        console.log(`   telegram_id: ${user.telegram_id}`);
        console.log(`   user_id: ${user.user_id}`);
        console.log(`   first_name: ${user.first_name}`);
        console.log(`   last_name: ${user.last_name}`);
        console.log(`   business_name: ${user.business_name}`);
        console.log(`   business_email: ${user.business_email}`);
        console.log(`   owner_address: ${user.owner_address}`);
        console.log(`   Personal Nuvion Account: ${user.nuvion_account_no || 'NULL'}`);
        console.log(`   Business Nuvion Account: ${user.nuvion_business_account_no || 'NULL'}\n`);
        break;
      }
    }

    if (!targetUser) {
      console.log('ℹ️  No user matching "igboze" found. Showing first user:\n');
      if (allUsers.length > 0) {
        targetUser = allUsers[0];
        console.log(`   telegram_id: ${targetUser.telegram_id}`);
        console.log(`   business_email: ${targetUser.business_email}`);
        console.log(`   business_name: ${targetUser.business_name}\n`);
      } else {
        console.error('❌ No users in database. Exiting.\n');
        process.exit(1);
      }
    }

    const USER_ID = targetUser.user_id || targetUser.telegram_id;

    // ═══ STEP 2: FIND PROFILES ═════════════════════════════════════════════
    console.log('STEP 2: Database - Finding profiles for this user...\n');
    const profiles = db.prepare(`
      SELECT profile_id, user_id, type, nuvion_entity_id, name, status, created_at
      FROM profiles
      WHERE user_id = ? OR user_id = ?
      ORDER BY type
    `).all(USER_ID, targetUser.telegram_id);

    console.log(`✅ PROFILES (${profiles.length}):`);
    if (profiles.length === 0) {
      console.log('   No profiles found.\n');
    } else {
      profiles.forEach((p, i) => {
        console.log(`\n   [${i+1}] ${p.type.toUpperCase()} Profile`);
        console.log(`       profile_id: ${p.profile_id}`);
        console.log(`       nuvion_entity_id: ${p.nuvion_entity_id || 'NULL'}`);
        console.log(`       status: ${p.status}`);
        console.log(`       name: ${p.name}`);
      });
    }
    console.log();

    // ═══ STEP 3: FIND ACCOUNTS ════════════════════════════════════════════
    console.log('STEP 3: Database - Finding accounts for these profiles...\n');
    const profileIds = profiles.map(p => p.profile_id);
    
    let accounts = [];
    if (profileIds.length > 0) {
      const placeholders = profileIds.map(() => '?').join(',');
      accounts = db.prepare(`
        SELECT 
          a.account_id, a.profile_id, a.nuvion_account_id, a.nuvion_account_no,
          a.beneficiary_name, a.bank_name, a.status, a.created_at,
          p.type as profile_type
        FROM accounts a
        JOIN profiles p ON a.profile_id = p.profile_id
        WHERE a.profile_id IN (${placeholders})
        ORDER BY p.type
      `).all(...profileIds);
    }

    console.log(`✅ ACCOUNTS (${accounts.length}):`);
    if (accounts.length === 0) {
      console.log('   ⚠️  NO ACCOUNTS FOUND IN DATABASE!\n');
    } else {
      accounts.forEach((a, i) => {
        console.log(`\n   [${i+1}] Account`);
        console.log(`       Profile Type: ${a.profile_type}`);
        console.log(`       Account ID: ${a.account_id}`);
        console.log(`       Nuvion Account ID: ${a.nuvion_account_id}`);
        console.log(`       Nuvion Account Number: ${a.nuvion_account_no || 'NULL'}`);
        console.log(`       Beneficiary Name: ${a.beneficiary_name}`);
        console.log(`       Bank Name: ${a.bank_name}`);
        console.log(`       Status: ${a.status}`);
      });
    }
    console.log();

    // ═══ STEP 4: CHECK FOR SOLVIUM ════════════════════════════════════════
    console.log('STEP 4: Database - Checking for "Solvium" references...\n');
    const hasSolvium = accounts.some(a =>
      (a.beneficiary_name && a.beneficiary_name.toLowerCase().includes('solvium')) ||
      (a.bank_name && a.bank_name.toLowerCase().includes('solvium'))
    );

    if (hasSolvium) {
      console.log('⚠️  FOUND SOLVIUM REFERENCES IN DATABASE:');
      accounts.forEach(a => {
        if ((a.beneficiary_name && a.beneficiary_name.toLowerCase().includes('solvium')) ||
            (a.bank_name && a.bank_name.toLowerCase().includes('solvium'))) {
          console.log(`   Account ${a.account_number}: "${a.beneficiary_name}"`);
          console.log(`   Bank: "${a.bank_name}"`);
        }
      });
    } else {
      console.log('✅ No Solvium references found in database accounts.\n');
    }
    console.log();

    // ═══ STEP 5: CHECK ACCOUNT SHARING ════════════════════════════════════
    console.log('STEP 5: Database - Checking for shared account numbers...\n');
    const personalAccts = accounts.filter(a => a.profile_type === 'personal');
    const businessAccts = accounts.filter(a => a.profile_type === 'business');

    if (personalAccts.length === 0) {
      console.log('⚠️  No personal accounts found\n');
    } else {
      console.log(`Personal Accounts: ${personalAccts.length}`);
      personalAccts.forEach(a => {
        console.log(`   ${a.nuvion_account_no}`);
      });
    }

    if (businessAccts.length === 0) {
      console.log('⚠️  No business accounts found\n');
    } else {
      console.log(`\nBusiness Accounts: ${businessAccts.length}`);
      businessAccts.forEach(a => {
        console.log(`   ${a.nuvion_account_no}`);
      });
    }

    const sharedNumbers = personalAccts
      .map(pa => pa.nuvion_account_no)
      .filter(num => businessAccts.some(ba => ba.nuvion_account_no === num));

    if (sharedNumbers.length > 0) {
      console.log(`\n⚠️ PROBLEM FOUND: Personal and Business share account numbers:`);
      sharedNumbers.forEach(num => console.log(`   ${num}`));
    } else {
      console.log(`\n✅ No shared account numbers between personal and business profiles.`);
    }
    console.log();

    // ═══ STEP 6: CHECK SHARED NUVION ENTITY ID ════════════════════════════
    console.log('STEP 6: Database - Checking if profiles share same Nuvion entity_id...\n');
    const personalProfile = profiles.find(p => p.type === 'personal');
    const businessProfile = profiles.find(p => p.type === 'business');

    if (!personalProfile || !businessProfile) {
      console.log('⚠️  Missing personal or business profile\n');
    } else if (personalProfile.nuvion_entity_id && businessProfile.nuvion_entity_id) {
      if (personalProfile.nuvion_entity_id === businessProfile.nuvion_entity_id) {
        console.log(`🔴 CRITICAL ISSUE: Both profiles share SAME Nuvion entity_id:\n`);
        console.log(`   Personal: ${personalProfile.nuvion_entity_id}`);
        console.log(`   Business: ${businessProfile.nuvion_entity_id}\n`);
      } else {
        console.log(`✅ Profiles have DIFFERENT Nuvion entity_ids:\n`);
        console.log(`   Personal: ${personalProfile.nuvion_entity_id}`);
        console.log(`   Business: ${businessProfile.nuvion_entity_id}\n`);
      }
    } else {
      console.log('⚠️  One or both profiles missing nuvion_entity_id\n');
      if (personalProfile) console.log(`   Personal: ${personalProfile.nuvion_entity_id || 'NULL'}`);
      if (businessProfile) console.log(`   Business: ${businessProfile.nuvion_entity_id || 'NULL'}`);
      console.log();
    }

    // ═══ FINAL ANALYSIS ════════════════════════════════════════════════════════
    console.log('='.repeat(90));
    console.log('📊 DIAGNOSIS');
    console.log('='.repeat(90) + '\n');

    const issues = [];

    if (personalAccts.length === 0) {
      issues.push('❌ Personal profile has NO accounts in DB');
    }
    if (businessAccts.length === 0) {
      issues.push('❌ Business profile has NO accounts in DB');
    }
    if (sharedNumbers.length > 0) {
      issues.push(`❌ Personal and Business profiles SHARE account number(s): ${sharedNumbers.join(', ')}`);
    }
    if (hasSolvium) {
      issues.push('❌ Solvium Games Ltd references found in account beneficiary_name or bank_name');
    }
    if (personalProfile && businessProfile && personalProfile.nuvion_entity_id === businessProfile.nuvion_entity_id && personalProfile.nuvion_entity_id) {
      issues.push('❌ Personal and Business profiles SHARE THE SAME Nuvion entity_id');
    }

    if (issues.length === 0) {
      console.log('✅ DATABASE IS CLEAN - No data integrity issues detected.');
      console.log('   The issue is likely in the frontend/API response layer.\n');
    } else {
      console.log('🔴 ISSUES FOUND:\n');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log();
    }

    console.log('='.repeat(90) + '\n');

  } catch (err) {
    console.error('Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
