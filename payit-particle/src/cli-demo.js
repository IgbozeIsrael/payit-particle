const readline = require('readline');
const bot = require('./bot');
const db = require('./db');
require('dotenv').config();

const isInteractive = Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.CI);

if (!isInteractive || isServerless) {
  console.log('CLI demo skipped in non-interactive environment.');
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let simulatedTelegramId = 'user_demo';

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m')
    .replace(/`(.*?)`/g, '\x1b[36m$1\x1b[0m');
}

async function startDemo() {
  console.clear();
  console.log('\x1b[35m==================================================\x1b[0m');
  console.log('\x1b[1m\x1b[35m         PAYIT ON PARTNER NETWORK — CLI HARNESS    \x1b[0m');
  console.log('\x1b[35m==================================================\x1b[0m');
  console.log(`\n🟢 \x1b[32mTARGET CHAIN: Arbitrum Sepolia Testnet\x1b[0m`);
  console.log(`• Particle Universal Account derivation indexes 0 & 1`);
  console.log(`• USDC Sepolia address: \x1b[36m0x75faf114eafb1BDbe23224ec7530404b110A4235\x1b[0m`);

  console.log('\n\x1b[1mAvailable commands:\x1b[0m');
  console.log('  \x1b[36m/auth\x1b[0m       - Social Auth login handshake (Particle Network)');
  console.log('  \x1b[36m/status\x1b[0m     - Check active profile and smart account maps');
  console.log('  \x1b[36m/switch\x1b[0m     - Switch between Personal and Business profiles');
  console.log('  \x1b[36m/lock\x1b[0m       - Lock current wallet sessions');
  console.log('  \x1b[36m/unlock\x1b[0m     - Unlock wallet sessions');
  console.log('  \x1b[36m/exit\x1b[0m       - Quit the demo harness');
  console.log('\x1b[35m--------------------------------------------------\x1b[0m');

  // Initial bot start message
  const initialResult = await bot.processMessage(simulatedTelegramId, '/start');
  console.log(`\n\x1b[35m[PayIT Bot]:\x1b[0m\n${formatMarkdown(initialResult.reply)}\n`);

  promptUser();
}

function promptUser() {
  rl.question(`\x1b[32m[You (TG: ${simulatedTelegramId})]:\x1b[0m `, async (input) => {
    const trimmed = input.trim();
    
    if (trimmed.toLowerCase() === '/exit') {
      console.log('Exiting PayIT. Goodbye!');
      rl.close();
      process.exit(0);
    }

    try {
      const result = await bot.processMessage(simulatedTelegramId, trimmed);
      console.log(`\n\x1b[35m[PayIT Bot]:\x1b[0m\n${formatMarkdown(result.reply)}\n`);
    } catch (err) {
      console.log(`\n❌ Error processing input: ${err.message}\n`);
    }

    promptUser();
  });
}

// Start CLI Demo
startDemo().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
