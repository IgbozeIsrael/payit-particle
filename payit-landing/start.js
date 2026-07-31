const { spawn } = require('child_process');

const port = process.env.PORT_OVERRIDE || '3000';
const host = '0.0.0.0';

console.log(`[PayIT Landing] Launching Next.js production server on ${host}:${port}...`);

const child = spawn('npx', ['next', 'start', '-H', host, '-p', port], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

child.on('error', (err) => {
  console.error('[PayIT Landing] Failed to start Next.js process:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`[PayIT Landing] Next.js process exited with code ${code}`);
  process.exit(code || 0);
});
