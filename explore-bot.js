const fs = require('fs');
const content = fs.readFileSync('payit-particle/src/bot.js', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('AWAITING_BIZ_NAME') || line.includes('session.state')) {
    console.log((i+1) + ': ' + line.substring(0, 100));
  }
}
console.log('Total lines:', lines.length);
