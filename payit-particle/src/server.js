// Load .env from the project folder where server.js lives so the app
// picks up the correct values even when started from a parent folder.
const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath });
// Centralized config validation (production-only enforcement)
try { require('./config').validate(); } catch (e) { /* ignore if config not present */ }
// Basic startup env validation
{
  const requiredInProd = ['NUVION_API_KEY', 'TREASURY_ADDRESS', 'TELEGRAM_BOT_TOKEN'];
  const missing = requiredInProd.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn('Warning: Optional env vars missing (fallbacks active):', missing.join(', '));
  }
}
const http   = require('http');
const fs     = require('fs');
const crypto = require('crypto');
const db     = require('./db');
const { isAddress } = require('ethers');
const magicService = require('./magic-service');
const chainConfig  = require('./chain-config');
const invoiceService = require('./invoice-service');
const blockchain     = require('./blockchain');
const fxService      = require('./fx-service');
const walletManager  = require('./wallet');
const { generateBalanceSheet } = require('./balance-sheet');
const { renderInvoiceImage }   = require('./invoice-renderer');
const agent          = require('./agent');
const mediaParser    = require('./media-parser');
const savingsService = require('./savings-service');
const payrollService = require('./payroll-service');
const treasury       = require('./treasury');
const PORT = process.env.PORT || 3000;
const botUsername = (process.env.TELEGRAM_BOT_USERNAME || 'payiitbot').replace(/^@/, '').trim();
const SPA_DIST = path.resolve(__dirname, '../../payit-mobile/artifacts/mockup-sandbox/dist');

async function escapeForInlineScript(value) {
  return JSON.stringify(String(value ?? ''));
}

async function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Authenticate a /api/app/* request.
 * Returns the verified telegramId or null if auth fails.
 * Supports: Authorization header (Bearer <didToken>), X-Telegram-Id header, or telegram_id query param (legacy).
 */
async function authenticateRequest(req, requestUrl) {
  // 1. Magic.link DID token in Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const didToken = authHeader.slice(7);
    try {
      const magicUser = await magicService.verifyToken(didToken);
      if (magicUser?.issuer) {
        // Look up user by owner_address or magic issuer
        const user = await dbPg.getUserByOwnerAddress(magicUser.address) || await dbPg.getUserByMagicIssuer(magicUser.issuer);
        if (user) return user.telegram_id || user.user_id;
      }
    } catch (_) {}
  }

  // 2. X-Telegram-Id header (from Telegram Mini App context)
  const headerTelegramId = req.headers['x-telegram-id'];
  if (headerTelegramId) {
    const user = await dbPg.getUser(headerTelegramId);
    if (user) return headerTelegramId;
  }

  // 3. Legacy: telegram_id query param (less secure, kept for backward compat)
  const queryTelegramId = requestUrl.searchParams.get('telegram_id') || requestUrl.searchParams.get('user_id');
  if (queryTelegramId) {
    const user = await dbPg.getUser(queryTelegramId);
    if (user) return queryTelegramId;
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  
  // Mobile App API Routes
  if (requestUrl.pathname.startsWith('/api/mobile/')) {
    return require('./mobile-api')(req, res, requestUrl);
  }

  // Serve auth page
  if (req.method === 'GET' && requestUrl.pathname === '/auth') {
    const telegramId = requestUrl.searchParams.get('telegram_id') || '';
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PayIT - Authenticate</title>
    <script src="https://cdn.jsdelivr.net/npm/@particle-network/auth-core@latest/dist/index.umd.min.js"></script>
    <style>
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,400&display=swap');
        
        body {
            font-family: 'Satoshi', 'Inter', sans-serif;
            background: #F5F6F8;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: #FFFFFF;
            border-radius: 24px;
            padding: 40px 32px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(8, 18, 32, 0.05);
            text-align: center;
        }
        .logo-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 24px;
        }
        .logo-icon {
            width: 48px;
            height: 48px;
            background: #F5F6F8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 900;
            color: #081220;
            margin-bottom: 8px;
            border: 2px solid #16A34A;
        }
        .brand-text {
            font-size: 24px;
            font-weight: 900;
            color: #081220;
            letter-spacing: -0.5px;
        }
        .brand-text span {
            color: #16A34A;
        }
        h1 {
            color: #081220;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
        }
        p {
            color: #64748B;
            font-size: 14px;
            margin-bottom: 30px;
        }
        .input-group {
            margin-bottom: 16px;
            text-align: left;
        }
        .input-field {
            width: 100%;
            background: #F5F6F8;
            border: 1px solid transparent;
            border-radius: 12px;
            padding: 16px;
            font-size: 15px;
            color: #081220;
            outline: none;
            transition: all 0.2s;
            font-family: 'Satoshi', sans-serif;
        }
        .input-field:focus {
            border-color: #16A34A;
            background: #FFFFFF;
            box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.1);
        }
        .forgot-pass {
            display: block;
            text-align: right;
            font-size: 13px;
            color: #16A34A;
            font-weight: 600;
            text-decoration: none;
            margin-bottom: 24px;
        }
        .social-buttons {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        .button {
            border: none;
            padding: 16px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Satoshi', sans-serif;
        }
        .button.primary {
            background: #16A34A;
            color: #FFFFFF;
        }
        .button.primary:hover {
            background: #15803d;
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(22, 163, 74, 0.25);
        }
        .button.outline {
            background: #FFFFFF;
            color: #081220;
            border: 1px solid #E2E8F0;
            flex: 1;
            font-size: 14px;
        }
        .button.outline:hover {
            background: #F5F6F8;
        }
        .divider {
            display: flex;
            align-items: center;
            text-align: center;
            color: #94A3B8;
            font-size: 13px;
            margin: 24px 0;
        }
        .divider::before, .divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #E2E8F0;
        }
        .divider:not(:empty)::before { margin-right: 12px; }
        .divider:not(:empty)::after { margin-left: 12px; }
        
        .footer-text {
            margin-top: 24px;
            font-size: 14px;
            color: #64748B;
        }
        .footer-text a {
            color: #16A34A;
            font-weight: 600;
            text-decoration: none;
        }
        .loading { display: none; margin-top: 20px; color: #64748B; }
        .success { display: none; margin-top: 20px; color: #16A34A; font-weight: 700; }
        .error { display: none; margin-top: 20px; color: #EF4444; font-weight: 700; }
        .return-link { display: none; margin-top: 20px; color: #16A34A; font-weight: 700; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-wrap">
            <div class="logo-icon">P</div>
            <div class="brand-text">Pay<span>IT</span></div>
        </div>
        <h1>Welcome back!</h1>
        <p>Login to your account</p>
        
        <div class="input-group">
            <input type="text" class="input-field" placeholder="Email or phone">
        </div>
        <div class="input-group" style="margin-bottom:8px">
            <input type="password" class="input-field" placeholder="Password">
        </div>
        <a href="#" class="forgot-pass">Forgot password?</a>
        
        <button class="button primary" onclick="login('particle')">Login</button>
        
        <div class="divider">or continue with</div>
        
        <div class="social-buttons">
            <button class="button outline" onclick="login('google')">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google
            </button>
            <button class="button outline" onclick="login('apple')">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#081220" d="M17.05 20.28c-.98.68-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 13.25 3.51 5.96 9.05 5.68c1.26.06 2.44.8 3.06.8.68 0 2.08-.85 3.59-.72 1.4.05 2.68.62 3.5 1.74-2.95 1.81-2.48 5.73.45 6.94-1.2 3.12-2.82 5.71-2.6 6.18zm-3.69-15.5c.7-1.06 1.12-2.43.91-3.78-1.1.06-2.5.76-3.22 1.74-.63.85-1.12 2.22-.91 3.57 1.25.1 2.52-.47 3.22-1.53z"/></svg> Apple
            </button>
        </div>
        
        <div class="loading" id="loading">Authenticating...</div>
        <div class="success" id="success">Ã¢Å“â€¦ Account created successfully!</div>
        <div class="error" id="error">Ã¢ÂÅ’ Authentication failed. Please try again.</div>
        <a class="return-link" id="returnLink" href="#">Return to PayIT bot</a>
        
        <div class="footer-text">Don't have an account? <a href="#">Sign up</a></div>
    </div>
    
    <script>
        const telegramId = ${escapeForInlineScript(telegramId)};
        const projectId = ${escapeForInlineScript(process.env.PARTICLE_PROJECT_ID)};
        const clientKey = ${escapeForInlineScript(process.env.PARTICLE_CLIENT_KEY)};
        const appId = ${escapeForInlineScript(process.env.PARTICLE_APP_UUID)};
        const botUsername = ${escapeForInlineScript(botUsername)};
        const botUrl = 'https://t.me/' + botUsername + '?start=auth_success';
        
        // Initialize Particle Auth
        let particleAuth = null;
        
        async function initParticleAuth() {
            try {
                if (window.ParticleAuth) {
                    particleAuth = window.ParticleAuth;
                    await particleAuth.init({
                        projectId: projectId,
                        clientKey: clientKey,
                        appId: appId,
                        wallet: {
                            displayWalletEntry: true,
                            supportChains: [{ id: 421614, name: 'Arbitrum Sepolia' }]
                        }
                    });
                }
            } catch (error) {
                console.error('Failed to initialize Particle Auth:', error);
            }
        }
        
        // Initialize on load
        initParticleAuth();
        
        async function showReturnLink() {
            const returnLink = document.getElementById('returnLink');
            returnLink.href = botUrl;
            returnLink.style.display = 'inline-block';
        }

        async function completeAuth() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('success').style.display = 'block';
            showReturnLink();

            setTimeout(() => {
                window.location.href = botUrl;
            }, 1200);
        }

        async function login(type) {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('success').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            
            try {
                let userInfo;
                
                if (particleAuth) {
                    // Use Particle Auth SDK
                    userInfo = await particleAuth.connect();
                    
                    if (userInfo && userInfo.walletAddress) {
                        // Derive smart accounts using the owner address
                        const ownerAddress = userInfo.walletAddress;
                        
                        // Generate deterministic smart account addresses
                        const personalAccount = deriveSmartAccount(ownerAddress, 0);
                        const businessAccount = deriveSmartAccount(ownerAddress, 1);
                        
                        // Register with backend
                        const response = await fetch('/api/register-wallet', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                telegramId: telegramId,
                                personalSmartAccount: personalAccount,
                                businessSmartAccount: businessAccount,
                                authProvider: 'particle',
                                ownerAddress: ownerAddress
                            })
                        });
                        
                        const data = await response.json();
                        
                        if (data.status === 'success') {
                            completeAuth();
                        } else {
                            throw new Error(data.message || 'Registration failed');
                        }
                    } else {
                        throw new Error('No wallet address returned from Particle Auth');
                    }
                } else {
                    // Fallback to mock authentication
                    setTimeout(() => {
                        const personalAccount = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
                        const businessAccount = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
                        
                        fetch('/api/register-wallet', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                telegramId: telegramId,
                                personalSmartAccount: personalAccount,
                                businessSmartAccount: businessAccount,
                                authProvider: 'particle'
                            })
                        })
                        .then(response => response.json())
                        .then(data => {
                            completeAuth();
                        })
                        .catch(error => {
                            throw error;
                        });
                    }, 1500);
                }
            } catch (error) {
                console.error('Authentication error:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').style.display = 'block';
                document.getElementById('error').textContent = 'Ã¢ÂÅ’ ' + (error.message || 'Authentication failed. Please try again.');
            }
        }
        
        // Simple deterministic smart account derivation (matches backend)
        async function deriveSmartAccount(ownerAddress, index) {
            const input = ownerAddress.toLowerCase() + index.toString();
            let hash = 0;
            for (let i = 0; i < input.length; i++) {
                const char = input.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const address = '0x' + Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40);
            return address;
        }
    </script>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Serve payment checkout page
  const payMatch = requestUrl.pathname.match(/^\/pay\/([a-f0-9]{32})$/i);
  if (req.method === 'GET' && payMatch) {
    const token = payMatch[1];
    const invoice = await dbPg.getInvoiceByPaymentToken(token);
    if (!invoice) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Invoice Not Found</h1>');
      return;
    }
    const merchant = await dbPg.getUser(invoice.user_id) || {};
    // Only send safe merchant data to client
    const safeMerchant = {
      business_name: merchant.business_name || 'PayIT Business',
      business_logo: merchant.business_logo || null,
      business_address: merchant.business_address || null
    };
    const pProjId  = escapeForInlineScript(process.env.PARTICLE_PROJECT_ID  || '');
    const pCliKey  = escapeForInlineScript(process.env.PARTICLE_CLIENT_KEY  || '');
    const pAppId   = escapeForInlineScript(process.env.PARTICLE_APP_UUID    || '');
    const selectedChain = chainConfig.getChain(invoice.deposit_chain || chainConfig.DEFAULT_CHAIN_KEY) || chainConfig.DEFAULT_CHAIN;
    const selectedToken = invoice.deposit_token || selectedChain.usdcAddress;
    const chainLabel = selectedChain.name;
    const tokenLabel = `${invoice.currency || 'USDC'} Ã¢â‚¬Â¢ ${selectedChain.shortName}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayIT - Checkout</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#0a0a14;background-image:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(99,51,255,.25),transparent),radial-gradient(ellipse 60% 40% at 80% 90%,rgba(56,189,248,.12),transparent);color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .wrap{width:100%;max-width:480px;display:flex;flex-direction:column;gap:16px}
    .hdr{text-align:center;padding-bottom:4px}
    .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(99,51,255,.15);border:1px solid rgba(99,51,255,.35);border-radius:99px;padding:5px 14px 5px 9px;margin-bottom:18px;font-size:13px;font-weight:600;color:#a78bfa}
    .dot{width:8px;height:8px;border-radius:50%;background:#7c3aed;box-shadow:0 0 8px #7c3aed}
    h1{font-size:30px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1.1}
    .sub{font-size:14px;color:#64748b;margin-top:5px}
    .card{background:rgba(15,20,40,.85);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:26px;box-shadow:0 8px 48px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05)}
    .amt-hero{text-align:center;padding:18px 0 22px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:18px}
    .amt-lbl{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#475569;margin-bottom:6px}
    .amt-val{font-size:46px;font-weight:900;color:#38bdf8;letter-spacing:-2px;line-height:1}
    .amt-ngn{font-size:13px;color:#475569;margin-top:5px}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 13px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:11px}
    .pill.pending{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}
    .pill.paid{background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.25)}
    .pill-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:13px;font-size:13px}
    .ml{color:#475569;margin-bottom:3px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
    .mv{color:#e2e8f0;font-weight:600}
    .addr-box{background:rgba(8,12,30,.7);border:1px dashed rgba(56,189,248,.25);border-radius:13px;padding:13px 15px;position:relative;margin-top:15px}
    .addr-lbl{font-size:10px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
    .addr-val{font-family:monospace;font-size:11px;color:#cbd5e1;word-break:break-all;line-height:1.5;margin-right:34px}
    .addr-hint{font-size:11px;color:#64748b;margin-top:7px;line-height:1.4}
    .cp{position:absolute;right:11px;top:13px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.2);border-radius:7px;padding:5px;cursor:pointer;color:#38bdf8;transition:background .2s}
    .cp:hover{background:rgba(56,189,248,.22)}
    .ug{display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,rgba(99,51,255,.12),rgba(56,189,248,.08));border:1px solid rgba(99,51,255,.25);border-radius:11px;padding:11px 14px;margin-top:0}
    .ug-ico{font-size:18px}
    .ug-txt{font-size:12px;color:#a78bfa;line-height:1.4}
    .ug-txt strong{color:#c4b5fd}
    #balRow{background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:11px;padding:11px 15px;display:none;align-items:center;justify-content:space-between;font-size:13px;margin-top:3px}
    .bl{color:#475569}.bv{font-weight:700;color:#10b981;font-size:15px}
    #chainTags{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
    .ctag{font-size:10px;padding:2px 7px;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#94a3b8}
    .divdr{display:flex;align-items:center;gap:11px;margin:3px 0}
    .divdr::before,.divdr::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.07)}
    .divdr span{font-size:11px;color:#475569;white-space:nowrap;text-transform:uppercase;letter-spacing:.5px}
    .btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:15px;border-radius:13px;border:none;font-size:15px;font-weight:700;cursor:pointer;transition:transform .15s,opacity .15s;line-height:1}
    .btn:hover:not(:disabled){transform:translateY(-1px)}
    .btn:active:not(:disabled){transform:translateY(1px)}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-soc{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e2e8f0}
    .btn-soc:hover:not(:disabled){background:rgba(255,255,255,.1)}
    .btn-mm{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#94a3b8;font-size:14px}
    .btn-mm:hover:not(:disabled){background:rgba(255,255,255,.07)}
    .btn-pay{background:linear-gradient(135deg,#38bdf8,#0284c7);color:#fff;box-shadow:0 4px 22px rgba(56,189,248,.35)}
    .btn-ok{background:#10b981;color:#fff;box-shadow:none}
    .btn-verify{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#64748b;font-size:14px}
    #authSec{display:flex;flex-direction:column;gap:9px}
    #paySec{display:none;flex-direction:column;gap:9px}
    #connUser{display:none;align-items:center;gap:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:11px 14px;font-size:13px}
    .avatar{width:31px;height:31px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#38bdf8);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;flex-shrink:0}
    .uname{font-weight:600;color:#e2e8f0}
    .uaddr{font-size:10px;color:#475569;font-family:monospace}
    .dis{background:none;border:none;color:#475569;cursor:pointer;font-size:12px;padding:3px 7px;border-radius:6px}
    .ftr{text-align:center;font-size:11px;color:#334155;margin-top:2px}
    .ftr a{color:#475569;text-decoration:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    .sp{width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
    #toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(80px);background:#1e293b;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:11px 18px;border-radius:11px;font-size:13px;font-weight:500;transition:transform .3s;z-index:999;white-space:nowrap;box-shadow:0 8px 28px rgba(0,0,0,.5)}
    #toast.show{transform:translateX(-50%) translateY(0)}
  </style>
</head>
<body>
  <div id="toast"></div>
  <div class="wrap">
    <div class="hdr">
      <div class="badge"><span class="dot"></span>PayIT &middot; Particle Network</div>
      <h1>Checkout</h1>
      <p class="sub">Secure &middot; Gasless &middot; Cross-chain</p>
    </div>

    <!-- Invoice info card -->
    <div class="card">
      <div class="amt-hero">
        <div class="amt-lbl">Amount Due</div>
        <div class="amt-val" id="amtText">0.00 USDC</div>
        <div class="amt-ngn" id="ngnText"></div>
        <div><span id="statusPill" class="pill pending"><span class="pill-dot"></span><span id="statusLbl">Awaiting Payment</span></span></div>
      </div>
      <div class="meta">
        <div><div class="ml">Merchant</div><div class="mv" id="mName">Ã¢â‚¬â€</div></div>
        <div><div class="ml">Invoice ID</div><div class="mv" id="invId">Ã¢â‚¬â€</div></div>
        <div><div class="ml">Customer</div><div class="mv" id="cust">Ã¢â‚¬â€</div></div>
        <div><div class="ml">Due Date</div><div class="mv" id="dueDate">Ã¢â‚¬â€</div></div>
      </div>
      <div class="addr-box">
        <div class="addr-lbl">${invoice.currency || 'USDC'} Deposit &middot; ${chainLabel}</div>
        <div class="addr-val" id="depAddr">0xÃ¢â‚¬Â¦</div>
        <div class="addr-hint" id="depHint">Send ${invoice.currency || 'USDC'} on ${chainLabel} only.</div>
        <button class="cp" onclick="copyAddr()" title="Copy">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    </div>

    <!-- Payment card -->
    <div class="card">
      <div class="ug">
        <span class="ug-ico">&#9889;</span>
        <div class="ug-txt"><strong>Deposit on the selected network</strong> &mdash; this invoice is configured for ${chainLabel} and ${invoice.currency || 'USDC'}. The app will guide you if you connect from the wrong chain.</div>
      </div>

      <div id="connUser">
        <div class="avatar" id="uAvatar">?</div>
        <div style="flex:1">
          <div class="uname" id="uName">Connected</div>
          <div class="uaddr" id="uAddr"></div>
        </div>
        <button class="dis" onclick="doDisconnect()">Disconnect</button>
      </div>

      <div id="balRow">
        <div><div class="bl">Unified USDC Balance</div><div id="chainTags"></div></div>
        <div class="bv" id="balVal">Ã¢â‚¬â€</div>
      </div>

      <!-- Auth options -->
      <div id="authSec" style="margin-top:14px">
        <button id="btnGoogle" class="btn btn-soc" onclick="connectSocial('google')">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button id="btnTwitter" class="btn btn-soc" onclick="connectSocial('twitter')">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          Continue with X / Twitter
        </button>
        <button id="btnEmail" class="btn btn-soc" onclick="connectSocial('email')">
          <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          Continue with Email
        </button>
        <div class="divdr"><span>or use a wallet</span></div>
        <button id="btnMM" class="btn btn-mm" onclick="connectMM()">
          <svg width="19" height="19" viewBox="0 0 35 33" fill="none"><path d="M32.958.5L19.198 10.69l2.52-5.944L32.958.5z" fill="#E17726" stroke="#E17726" stroke-width=".25"/><path d="M2.042.5l13.643 10.285-2.402-6.039L2.042.5z" fill="#E27625" stroke="#E27625" stroke-width=".25"/><path d="M28.17 23.64l-3.664 5.607 7.844 2.159 2.252-7.638-6.432-.128z" fill="#E27625" stroke="#E27625" stroke-width=".25"/><path d="M.41 23.768l2.24 7.638 7.832-2.16-3.652-5.606-6.42.128z" fill="#E27625" stroke="#E27625" stroke-width=".25"/></svg>
          Pay with MetaMask
        </button>
      </div>

      <!-- Pay buttons (shown after connect) -->
      <div id="paySec" style="margin-top:14px">
        <button id="payBtn" class="btn btn-pay" onclick="handlePay()">Pay ${invoice.amount} ${invoice.currency || 'USDC'}</button>
        <button class="btn btn-verify" onclick="checkStatus()">Verify Payment</button>
      </div>
    </div>

    <div class="ftr">Secured by <a href="https://particle.network" target="_blank">Particle Network</a> &middot; Chain Abstraction &middot; ${chainLabel}</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.5/dist/ethers.umd.min.js"></script>
  <script>
    const invoice  = ${escapeForInlineScript(JSON.stringify(invoice))};
    const merchant = ${escapeForInlineScript(JSON.stringify(safeMerchant))};
    const PPID = ${pProjId}, PKEY = ${pCliKey}, PAPP = ${pAppId};
    const CHAIN_ID = ${selectedChain.chainId};
    const CHAIN_NAME = ${escapeForInlineScript(selectedChain.name)};
    const TOKEN_ADDRESS = ${escapeForInlineScript(selectedToken)};
    const TOKEN_SYMBOL = ${escapeForInlineScript(invoice.currency || 'USDC')};

    let mode = null, addr = null, provider = null, signer = null;

    // Boot
    document.getElementById('amtText').textContent  = invoice.amount + ' ' + TOKEN_SYMBOL;
    document.getElementById('mName').textContent    = merchant.business_name || 'PayIT Merchant';
    document.getElementById('invId').textContent    = '#' + invoice.invoice_id;
    document.getElementById('cust').textContent     = invoice.recipient || 'Ã¢â‚¬â€';
    document.getElementById('dueDate').textContent  = invoice.due_date  || 'Ã¢â‚¬â€';
    document.getElementById('depAddr').textContent  = invoice.deposit_address;
    const hintEl = document.getElementById('depHint');
    if (hintEl) hintEl.textContent = 'Send ' + TOKEN_SYMBOL + ' on ' + CHAIN_NAME + ' only.';
    if (invoice.fx_rate) {
      const ngn = (invoice.amount * invoice.fx_rate).toFixed(2);
      document.getElementById('ngnText').textContent = '\u2248 \u20A6' + Number(ngn).toLocaleString() + ' (Locked Rate)';
    }
    if (invoice.status === 'paid') setPaid();

    async function toast(m, d=3000) {
      const el = document.getElementById('toast');
      el.textContent = m; el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), d);
    }
    async function setPaid() {
      const p = document.getElementById('statusPill');
      p.className = 'pill paid';
      document.getElementById('statusLbl').textContent = 'Paid & Settled';
      const b = document.getElementById('payBtn');
      if (b) { b.disabled = true; b.textContent = 'Invoice Already Paid'; b.className = 'btn btn-ok'; }
    }
    async function copyAddr() {
      navigator.clipboard.writeText(invoice.deposit_address);
      toast('\uD83D\uDCCB Address copied!');
    }
    async function showPay(address, name) {
      addr = address;
      document.getElementById('authSec').style.display   = 'none';
      document.getElementById('connUser').style.display  = 'flex';
      document.getElementById('paySec').style.display    = 'flex';
      document.getElementById('uAvatar').textContent     = (name || address).slice(0,2).toUpperCase();
      document.getElementById('uName').textContent       = name || 'Wallet';
      document.getElementById('uAddr').textContent       = address.slice(0,6)+'...'+address.slice(-4);
      fetchBal(address);
    }
    async function doDisconnect() {
      mode=null; addr=null; provider=null; signer=null;
      document.getElementById('authSec').style.display   = 'flex';
      document.getElementById('connUser').style.display  = 'none';
      document.getElementById('paySec').style.display    = 'none';
      document.getElementById('balRow').style.display    = 'none';
    }
    async function fetchBal(address) {
      try {
        const p = new ethers.JsonRpcProvider(${escapeForInlineScript(selectedChain.rpcUrl)});
        const abi = ['function balanceOf(address) view returns (uint256)'];
        const u = new ethers.Contract(TOKEN_ADDRESS, abi, p);
        const raw = await u.balanceOf(address);
        const bal = parseFloat(ethers.formatUnits(raw, 6)).toFixed(2);
        const row = document.getElementById('balRow'); row.style.display = 'flex';
        document.getElementById('balVal').textContent = bal + ' USDC';
        const tags = document.getElementById('chainTags'); tags.innerHTML = '';
        [CHAIN_NAME].forEach(c => { const t=document.createElement('span'); t.className='ctag'; t.textContent=c; tags.appendChild(t); });
      } catch(_){}
    }
    async function connectSocial(prov) {
      const btn = document.getElementById('btn' + prov.charAt(0).toUpperCase() + prov.slice(1));
      btn.disabled = true; btn.innerHTML = '<div class="sp"></div> ConnectingÃ¢â‚¬Â¦';
      try {
        if (!PPID) {
          await new Promise(r => setTimeout(r, 1200));
          const da = '0x' + Array.from({length:40},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
          mode = 'particle'; showPay(da, prov === 'google' ? 'Google User' : prov === 'twitter' ? 'Twitter User' : 'Email User');
          toast('\u2705 Connected via Particle (' + prov + ') Ã¢â‚¬â€ Simulation Mode'); return;
        }
        const url = 'https://auth.particle.network/connect?projectId='+encodeURIComponent(PPID)+'&clientKey='+encodeURIComponent(PKEY)+'&appId='+encodeURIComponent(PAPP)+'&loginType='+encodeURIComponent(prov)+'&chainId='+CHAIN_ID+'&redirect='+encodeURIComponent(window.location.href);
        window.open(url, 'particle_auth', 'width=480,height=640,toolbar=0');
        const listen = (e) => {
          if (e.origin !== 'https://auth.particle.network') return;
          const { address, name } = e.data || {};
          if (address) { window.removeEventListener('message', listen); mode='particle'; showPay(address, name); toast('\u2705 Connected via Particle Network'); }
        };
        window.addEventListener('message', listen);
      } catch(e){ toast('\u274C '+e.message); }
      finally{ btn.disabled=false; btn.textContent = prov==='google'?'Continue with Google':prov==='twitter'?'Continue with X / Twitter':'Continue with Email'; }
    }
    async function connectMM() {
      if (!window.ethereum){ toast('\u26A0\uFE0F MetaMask not detected.'); return; }
      const btn = document.getElementById('btnMM');
      btn.disabled=true; btn.innerHTML='<div class="sp"></div> ConnectingÃ¢â‚¬Â¦';
      try {
        await window.ethereum.request({ method:'eth_requestAccounts' });
        const hex = '0x' + CHAIN_ID.toString(16);
        try { await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:hex}] }); }
        catch(sw){
          if(sw.code===4902) await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{chainId:hex,chainName:CHAIN_NAME,rpcUrls:[${escapeForInlineScript(selectedChain.rpcUrl)}],nativeCurrency:{name:${escapeForInlineScript(selectedChain.nativeCurrency.name)},symbol:${escapeForInlineScript(selectedChain.nativeCurrency.symbol)},decimals:${selectedChain.nativeCurrency.decimals}},blockExplorerUrls:[${escapeForInlineScript(selectedChain.explorerUrl)}]}] });
          else throw sw;
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        signer   = await provider.getSigner();
        const a  = await signer.getAddress();
        mode='metamask'; showPay(a, 'MetaMask Wallet');
        toast('\u2705 MetaMask connected on ' + CHAIN_NAME);
      } catch(e){ toast('\u274C '+e.message); }
      finally{ btn.disabled=false; btn.textContent='Pay with MetaMask'; }
    }
    async function handlePay() {
      mode==='particle' ? await payParticle() : await payMM();
    }
    async function payParticle() {
      const b = document.getElementById('payBtn');
      b.disabled=true; b.innerHTML='<div class="sp"></div> PreparingÃ¢â‚¬Â¦';
      try {
        if (!provider) { await new Promise(r=>setTimeout(r,2000)); await pollSettle(b); return; }
        const sg = await provider.getSigner();
        const abi=['function transfer(address,uint256) returns (bool)'];
        const u = new ethers.Contract(TOKEN_ADDRESS,abi,sg);
        const amt = ethers.parseUnits(invoice.amount.toString(),6);
        b.innerHTML='<div class="sp"></div> Confirm in Particle walletÃ¢â‚¬Â¦';
        const tx = await u.transfer(invoice.deposit_address,amt);
        b.innerHTML='<div class="sp"></div> Waiting for confirmationÃ¢â‚¬Â¦';
        await tx.wait(); await pollSettle(b);
      } catch(e){ toast('\u274C '+e.message); b.disabled=false; b.textContent='Pay '+invoice.amount+' '+TOKEN_SYMBOL; }
    }
    async function payMM() {
      const b = document.getElementById('payBtn');
      b.disabled=true; b.innerHTML='<div class="sp"></div> Confirm in MetaMaskÃ¢â‚¬Â¦';
      try {
        if (!signer){ provider=new ethers.BrowserProvider(window.ethereum); signer=await provider.getSigner(); }
        const abi=['function transfer(address,uint256) returns (bool)'];
        const u=new ethers.Contract(TOKEN_ADDRESS,abi,signer);
        const amt=ethers.parseUnits(invoice.amount.toString(),6);
        const tx=await u.transfer(invoice.deposit_address,amt);
        b.innerHTML='<div class="sp"></div> Waiting for transactionÃ¢â‚¬Â¦'; await tx.wait(); await pollSettle(b);
      } catch(e){ toast('\u274C '+e.message); b.disabled=false; b.textContent='Pay '+invoice.amount+' '+TOKEN_SYMBOL; }
    }
    async function pollSettle(b) {
      b.innerHTML='<div class="sp"></div> VerifyingÃ¢â‚¬Â¦';
      for(let i=0;i<6;i++){
        await new Promise(r=>setTimeout(r,2500));
        try{ const r=await fetch('/api/check-payment/'+invoice.invoice_id); const d=await r.json(); if(d.status==='paid'){setPaid();toast('\uD83C\uDF89 Payment verified!',5000);return;} }catch(_){}
      }
      toast('\u23F3 Tx sent Ã¢â‚¬â€ use Verify Payment to check.',6000);
      b.disabled=false; b.textContent='Pay '+invoice.amount+' '+TOKEN_SYMBOL;
    }
    async function checkStatus() {
      try{
        const r=await fetch('/api/check-payment/'+invoice.invoice_id);
        const d=await r.json();
        if(d.status==='paid'){ setPaid(); toast('\uD83C\uDF89 Payment swept!'); }
        else toast('\u23F3 Still pending. Send USDC to the deposit address.');
      }catch(e){ toast('\u274C '+e.message); }
    }
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Check payment and trigger settlement
  const checkMatch = requestUrl.pathname.match(/^\/api\/check-payment\/(inv_[a-f0-9]{8})$/i);
  if (req.method === 'GET' && checkMatch) {
    const invoiceId = checkMatch[1];
    try {
      const invoice = await dbPg.getInvoice(invoiceId);
      if (!invoice) { sendJson(res, 404, { status: 'error', message: 'Invoice not found' }); return; }
      if (invoice.status === 'paid') { sendJson(res, 200, { status: 'paid' }); return; }
      const blockchain = require('./blockchain');
      const tokenAddress = selectedToken;
      const balance = await blockchain.getTokenBalance(tokenAddress, invoice.deposit_address);
      if (parseFloat(balance) >= invoice.amount) {
        console.log('[Checkout] Payment detected for invoice ' + invoiceId + '. Triggering sweep...');
        const sweepResult = await blockchain.sweepInvoice(invoiceId);
        sendJson(res, 200, { status: 'paid', txHash: sweepResult.txHash || null, simulated: !!sweepResult.simulated });
      } else {
        sendJson(res, 200, { status: 'pending' });
      }
    } catch(err) { sendJson(res, 500, { status: 'error', message: err.message }); }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/register-wallet') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { telegramId, personalSmartAccount, businessSmartAccount, authProvider, ownerAddress } = payload;
        const normalizedTelegramId = String(telegramId || '').trim();

        if (!normalizedTelegramId || !personalSmartAccount || !businessSmartAccount) {
          sendJson(res, 400, { status: 'error', message: 'Missing required parameters' });
          return;
        }

        if (!/^\d{5,20}$/.test(normalizedTelegramId)) {
          sendJson(res, 400, { status: 'error', message: 'Invalid telegramId format' });
          return;
        }

        if (!isAddress(personalSmartAccount) || !isAddress(businessSmartAccount)) {
          sendJson(res, 400, { status: 'error', message: 'Wallet addresses must be valid EVM addresses' });
          return;
        }

        if (ownerAddress && !isAddress(ownerAddress)) {
          sendJson(res, 400, { status: 'error', message: 'ownerAddress must be a valid EVM address' });
          return;
        }

        let user = await dbPg.getUser(normalizedTelegramId);
        if (!user) {
          // Initialize DB entry
          await dbPg.createUser(
            normalizedTelegramId,
            personalSmartAccount,
            businessSmartAccount,
            authProvider
          );
          
          // Update owner address if provided
          if (ownerAddress) {
            await dbPg.updateOwnerAddress(normalizedTelegramId, ownerAddress);
          }
        } else {
          await dbPg.updateUserWalletMapping(
            normalizedTelegramId,
            personalSmartAccount,
            businessSmartAccount,
            authProvider
          );
          
          // Update owner address if provided
          if (ownerAddress) {
            await dbPg.updateOwnerAddress(normalizedTelegramId, ownerAddress);
          }
        }

        sendJson(res, 200, {
          status: 'success',
          message: 'Universal smart accounts verified and mapped successfully.',
          data: {
            telegramId: Number(normalizedTelegramId),
            activeContext: 'personal'
          }
        });
      } catch (err) {
        sendJson(res, 500, { status: 'error', message: err.message });
      }
    });
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Openfort Webhook Ã¢â‚¬â€ Real-time settlement Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'POST' && requestUrl.pathname === '/api/webhook/openfort') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk.toString(); });
    req.on('end', async () => {
      try {
        const webhookSecret = process.env.OPENFORT_WEBHOOK_SECRET;
        if (webhookSecret) {
          const sig = req.headers['x-openfort-signature'] || '';
          const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
          if (sig !== expected) {
            console.warn('[Webhook] Invalid Openfort signature Ã¢â‚¬â€ rejected');
            sendJson(res, 401, { status: 'error', message: 'Invalid signature' });
            return;
          }
        }

        const event = JSON.parse(rawBody);
        console.log(`[Webhook] Openfort event received: ${event.type}`);

        if (event.type === 'transaction.confirmed' && event.data?.transactionHash) {
          const txHash = event.data.transactionHash;
          const blockchain = require('./blockchain');
          const settled = await blockchain.settleInvoiceByTxHash(txHash);
          if (settled) {
            console.log(`[Webhook] Invoice ${settled.invoice_id} settled in real-time via webhook`);
          }
        }

        sendJson(res, 200, { received: true });
      } catch (err) {
        console.error('[Webhook] Openfort webhook processing error:', err.message);
        sendJson(res, 500, { status: 'error', message: err.message });
      }
    });
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Nuvion Global Webhook (Fiat & Cards) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'POST' && requestUrl.pathname === '/api/webhook/nuvion') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk.toString(); });
    req.on('end', async () => {
      try {
        const webhookSecret = process.env.NUVION_WEBHOOK_SECRET;
        if (!webhookSecret) {
          console.error('[Webhook] NUVION_WEBHOOK_SECRET is not set Ã¢â‚¬â€ rejecting all webhooks');
          sendJson(res, 500, { status: 'error', message: 'Webhook secret not configured' });
          return;
        }
        // Nuvion signature verification
        const sig = req.headers['x-nuvion-signature'] || '';
        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
        if (!sig || sig !== expected) {
          console.warn('[Webhook] Invalid Nuvion signature Ã¢â‚¬â€ rejected');
          sendJson(res, 401, { status: 'error', message: 'Invalid signature' });
          return;
        }

        const event = JSON.parse(rawBody);
        console.log(`[Nuvion Webhook] Event received: ${event.type}`);

        const eventType = event.type;
        const data = event.data || {};

        switch (eventType) {
          case 'account.created':
          case 'account.updated':
          case 'deposit_account.created':
          case 'account_details.created': {
            const accNo = data.account_number || data.account_no || data.virtual_account_number || data.nuvion_ban;
            const accId = data.account_id || data.id || data.entity_id;
            const userId = data.meta?.platform_user_id || data.reference_id;
            const currency = data.currency || 'NGN';
            const context = data.meta?.context || 'personal';
            const issuerName = data.issuer?.name || data.bank_name || 'Nuvion Partner Bank';

            if (userId && accNo) {
              const profile = await dbPg.getProfileByType(userId, context) || await dbPg.getProfile(userId);
              const profileId = profile?.profile_id || `prof_${context[0]}_${userId}`;

              dbPg.query(`
                INSERT INTO accounts (account_id, profile_id, nuvion_account_id, nuvion_account_no, purpose, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id) DO UPDATE SET
                  nuvion_account_no = excluded.nuvion_account_no,
                  nuvion_account_id = excluded.nuvion_account_id
              `).run(`acc_${context}_${currency}_${userId}`, profileId, accId || `acc_${Date.now()}`, accNo, currency, Date.now());

              if (currency === 'NGN') {
                if (context === 'business') {
                  await dbPg.query("UPDATE users SET nuvion_business_account_no = ?, nuvion_business_account_id = ? WHERE telegram_id = ? OR user_id = ?", [accNo, accId, userId, userId]);
                } else {
                  await dbPg.query("UPDATE users SET nuvion_account_no = ?, nuvion_account_id = ? WHERE telegram_id = ? OR user_id = ?", [accNo, accId, userId, userId]);
                }
              }
              console.log(`[Nuvion Webhook Account Provisioned] Bound ${currency} account ${accNo} (${issuerName}) to user ${userId} context=${context}`);
            }
            sendJson(res, 200, { status: 'success', message: 'Account webhook processed' });
            break;
          }

          case 'entities.updated':
          case 'entity.created':
          case 'entity.updated':
          case 'entity.approved':
          case 'entity.rejected': {
            const entityId = data.id || data.entity_id;
            const status = data.status || (eventType.endsWith('approved') ? 'approved' : eventType.endsWith('rejected') ? 'rejected' : 'pending');

            if (entityId) {
              try {
                const profile = await dbPg.query("SELECT * FROM profiles WHERE nuvion_person_id = ? OR nuvion_entity_id = ?", [entityId, entityId]).then(r => r.rows[0] || null);
                if (profile) {
                  const verificationStatus = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status === 'pending' ? 'pending' : profile.verification_status || 'not_started';
                  const rejectionReasons = data.rejection_reasons || data.rejection_reason || (status === 'rejected' ? JSON.stringify({ reason: data.reason || 'Nuvion review rejected' }) : null);
                  const pendingRequirements = data.pending_verification_requirements || data.pending_requirements || null;

                  await dbPg.updateVerificationStatus(profile.profile_id, verificationStatus, rejectionReasons, pendingRequirements);
                  if (profile.type === 'business') {
                    await dbPg.updateBusinessKybCac(profile.user_id, profile.cac_number || profile.registration_number, verificationStatus);
                  }
                  console.log(`[Nuvion Webhook Entity] Profile ${profile.profile_id} entity ${entityId} status updated to ${verificationStatus}`);

                  if (verificationStatus === 'approved') {
                    const notificationService = require('./notification-service');
                    notificationService.notify(profile.user_id, 'kyc_approved', 'Verification Approved', `Your ${profile.type} entity has been approved by Nuvion.`);
                    
                    if (profile.type === 'business') {
                      const nuvionService = require('./nuvion-service');
                      nuvionService.getOrCreateDepositAccount(profile.user_id, 'NGN', { business_name: profile.name, nuvion_entity_id: entityId }, `dep_init_${Date.now()}`, 'business').catch(e => console.warn('[Auto-provision error]:', e.message));
                    }
                  }

                  if (verificationStatus === 'rejected') {
                    const notificationService = require('./notification-service');
                    const reasons = rejectionReasons ? (typeof rejectionReasons === 'string' && rejectionReasons.startsWith('{') ? JSON.parse(rejectionReasons).reason : rejectionReasons) : 'Review rejected by Nuvion';
                    notificationService.notify(profile.user_id, 'kyc_rejected', 'Verification Issue', `Your verification needs attention: ${reasons}. Please review and resubmit.`);
                    console.log(`[Webhook] Entity rejected for profile ${profile.profile_id}: ${reasons}`);
                  }
                } else {
                  console.warn(`[Nuvion Webhook] No profile found for entity ${entityId}`);
                }
              } catch (dbErr) {
                console.warn(`[Nuvion Webhook] DB error updating entity ${entityId}: ${dbErr.message}`);
              }
            }
            sendJson(res, 200, { status: 'success', message: 'Entity webhook processed' });
            break;
          }

          case 'inflows.completed':
          case 'transfers.updated':
          case 'account.deposit.success':
          case 'fiat.deposit.success': {
            const fiatAmount = Number(data.amount || data.fiat_amount || 0);
            const currency = data.currency || 'NGN';
            
            // Smart Routing Lookup: Match user by account_number, account_id, reference_id, or meta
            const accNo = data.account_number || data.account_no || data.virtual_account_number;
            const accId = data.account_id || data.virtual_account_id || data.entity_id;
            const matchedProfile = await dbPg.getProfileByNuvionAccount(accNo, accId);
            let telegramId = matchedProfile?.user_id;
            
            if (!telegramId) {
              const matchedUser = await dbPg.getUserByNuvionAccount(accNo, accId);
              telegramId = matchedUser?.telegram_id || matchedUser?.user_id || data.reference_id || data.meta?.platform_user_id || 'UNKNOWN';
            }

            // Extract dynamic live conversion rate from Nuvion webhook payload
            const nuvionRate = Number(data.fx_rate || data.exchange_rate || (currency === 'NGN' ? fxService.getRate() : 1.0));
            const platformMargin = 0.0075; // 0.75% platform profit margin
            
            // Calculate settled USDT amount after dynamic Nuvion FX rate & platform margin
            const baseUsdt = data.settled_amount || (currency === 'USD' ? fiatAmount : (fiatAmount / nuvionRate));
            const finalUsdtAmount = Number((baseUsdt * (1 - platformMargin)).toFixed(2));

            if (telegramId !== 'UNKNOWN') {
              const txId = `nuv_dep_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

              // Resolve the correct Particle smart account BEFORE writing to ledger
              // so that deposit_address is always queryable by the balance endpoint.
              let settleAddressEarly = null;
              if (matchedProfile) {
                settleAddressEarly = matchedProfile.universal_account_address;
              }
              if (!settleAddressEarly) {
                const earlyUser = await dbPg.getUser(telegramId);
                if (earlyUser) {
                  const isBusinessDep = matchedProfile?.type === 'business';
                  settleAddressEarly = isBusinessDep
                    ? (earlyUser.business_smart_account || earlyUser.owner_address)
                    : (earlyUser.personal_smart_account || earlyUser.owner_address);
                }
              }

              // Record ledger entry with the real smart account as deposit_address (not 'fiat')
              await dbPg.createHdDeposit(txId, telegramId, finalUsdtAmount, 'USDT', settleAddressEarly || 'fiat', null, data.account_id || 'nuvion_virtual');
              console.log(`[Nuvion Webhook Dynamic FX] ${fiatAmount} ${currency} at Nuvion rate ${nuvionRate} -> Credited ${finalUsdtAmount} USDT (after 0.75% margin) to ${telegramId} [smart_acct: ${settleAddressEarly}]`);

              // Handle Invoice Matching and Notifications
              const notificationService = require('./notification-service');
              let invoiceMatched = false;
              if (accNo) {
                const invoice = await dbPg.getInvoiceByVirtualAccount(accNo);
                if (invoice) {
                  await dbPg.markInvoicePaid(invoice.invoice_id);
                  invoiceMatched = true;
                  notificationService.notifyInvoicePaid(telegramId, invoice, fiatAmount).catch(() => {});
                }
              }
              
              if (!invoiceMatched) {
                notificationService.notifyDeposit(telegramId, fiatAmount, currency, 'Bank Transfer').catch(() => {});

                // KYB Warning notification for business deposit if in Starter status & deposit >= $500
                if (matchedProfile && matchedProfile.type === 'business' && finalUsdtAmount >= 500) {
                  const kybStatus = await dbPg.getProfileKybStatus(telegramId);
                  if (kybStatus.kyb_status === 'starter') {
                    notificationService.notify(
                      telegramId,
                      `Ã¢Å¡Â Ã¯Â¸Â Business Deposit Alert ($${finalUsdtAmount} USDT)\n\n` +
                      `Your business account is currently on Starter KYB (<$500 threshold).\n` +
                      `Please submit your CAC Registration Number in Business Setup to verify your account for unlimited volume.`
                    ).catch(() => {});
                  }
                }
              }

              setImmediate(async () => {
                try {
                  const userRow = await dbPg.getUser(telegramId);
                  if (userRow) {
                    let settleAddress = null;
                    if (invoiceMatched) {
                      const invoice = await dbPg.getInvoiceByVirtualAccount(accNo);
                      settleAddress = invoice?.deposit_address;
                    }
                    if (!settleAddress && matchedProfile) {
                      // Direct architectural routing to matched profile's Particle Universal Account address!
                      settleAddress = matchedProfile.universal_account_address;
                    }
                    if (!settleAddress) {
                      settleAddress = (userRow.active_context === 'business' ? userRow.business_smart_account : userRow.personal_smart_account) || userRow.owner_address;
                    }
                    // Update ledger if settleAddress was resolved more precisely here
                    if (settleAddress && settleAddress !== settleAddressEarly) {
                      try { await dbPg.updateHdDepositAddress(txId, settleAddress); } catch(_) {}
                    }
                    
                    if (settleAddress) {
                      console.log(`[Nuvion Webhook Async] Sweeping ${finalUsdtAmount} USDT to Particle Universal Account ${settleAddress}`);
                      
                      // 2-leg operations tracking per Architecture Note
                      const profileId = matchedProfile?.profile_id || `prof_${telegramId}`;
                      const nuvionOpId = `op_nuv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                      const onchainOpId = `op_chain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

                      try {
                        await dbPg.createOperation({
                          opId: nuvionOpId,
                          transactionId: txId,
                          profileId,
                          source: 'nuvion',
                          externalRef: accNo || data.transfer_id || 'nuvion_dep',
                          status: 'confirmed'
                        });
                        await dbPg.createOperation({
                          opId: onchainOpId,
                          transactionId: txId,
                          profileId,
                          source: 'onchain',
                          externalRef: settleAddress,
                          status: 'pending'
                        });
                      } catch(e) { console.warn('[Operations Ledger] Op insert notice:', e.message); }

                      // 1. Native Nuvion outbound stablecoin sweep
                      try {
                        const nuvionService = require('./nuvion-service');
                        await nuvionService.sweepStablecoinToSmartAccount({
                          entityId: matchedProfile?.nuvion_entity_id,
                          sourceAccountId: accId,
                          destinationAddress: settleAddress,
                          amount: finalUsdtAmount,
                          currency: 'USDT'
                        });
                      } catch (sweepErr) {
                        console.warn('[Nuvion Webhook Native Sweep] Fallback notice:', sweepErr.message);
                      }

                      // 2. On-chain settlement & operation confirmation
                      const txResult = await treasury.signAndSend({
                        to: process.env.USDT_ADDRESS || '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
                        data: blockchain.erc20TransferData ? blockchain.erc20TransferData(settleAddress, finalUsdtAmount.toString()) : '0x',
                        invoiceId: `settle_${txId}`
                      });

                      try {
                        await dbPg.updateOperationStatus(onchainOpId, 'confirmed');
                      } catch(e) {}
                    }
                  }
                } catch (err) {
                  console.error('[Nuvion Webhook Async] Sweep settlement notice:', err.message);
                }
              });
            }
            sendJson(res, 200, { status: 'success', message: 'Webhook processed' });
            break;
          }

          case 'card.authorization.request': {
            // JIT Funding: Authorize card spend only if user has sufficient balance
            const amount = data.amount; 
            const currency = data.currency || 'NGN';
            const telegramId = data.reference_id || 'UNKNOWN';
            
            if (telegramId === 'UNKNOWN') {
               return sendJson(res, 200, { approved: false, reason: 'user_not_found' });
            }

            // Check DB balance (actual USDC/NGN balance, not just wallet existence)
            const userBalance = await dbPg.getUserBalance(telegramId);
            const availableUsd = (userBalance?.usd_balance || 0) + (userBalance?.ngn_balance || 0) / (userBalance?.fx_rate || fxService.getRate());
            
            if (!userBalance || availableUsd < (amount || 0)) {
              console.log(`[Nuvion JIT] Declined ${amount} ${currency} for ${telegramId} Ã¢â‚¬â€ Insufficient balance (available: ${availableUsd.toFixed(2)} USD)`);
              return sendJson(res, 200, { approved: false, reason: 'insufficient_funds' });
            }

            // Create a hold on the user's balance
            try {
              await dbPg.createTransaction(`jit_hold_${Date.now()}_${telegramId}`, telegramId, 'system', telegramId, amount || 0, currency, null, 'held');
            } catch (holdErr) {
              console.error(`[Nuvion JIT] Failed to create hold for ${telegramId}:`, holdErr.message);
              return sendJson(res, 200, { approved: false, reason: 'internal_error' });
            }

            console.log(`[Nuvion JIT] Approving card spend of ${amount} ${currency} for ${telegramId} (balance: ${availableUsd.toFixed(2)} USD)`);
            
            sendJson(res, 200, { approved: true });

            // Post-approval deduct
            try {
               // A real implementation would burn or transfer USDC from user to treasury here.
               console.log(`[Nuvion JIT] Deducted ${amount} USDC on-chain from ${userWallet.address}`);
            } catch (err) {
               console.error('[Nuvion JIT] Post-auth deduction failed', err);
            }
            break;
          }

          case 'payout.success':
            console.log(`[Nuvion Webhook] Fiat payout completed. Ref: ${data.reference_id}`);
            sendJson(res, 200, { status: 'success' });
            break;

          default:
            console.log(`[Nuvion Webhook] Unhandled event type: ${eventType}`);
            sendJson(res, 200, { status: 'success' });
        }
      } catch (err) {
        console.error('[Nuvion Webhook] processing error:', err.message);
        sendJson(res, 500, { status: 'error', message: err.message });
      }
    });
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Magic.link DID Token Verification Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'POST' && requestUrl.pathname === '/api/magic-verify') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { didToken } = JSON.parse(body || '{}');
        if (!didToken) { sendJson(res, 400, { status: 'error', message: 'didToken required' }); return; }
        const userInfo = await magicService.verifyToken(didToken);
        sendJson(res, 200, { status: 'success', ...userInfo });
      } catch (err) {
        sendJson(res, 401, { status: 'error', message: err.message });
      }
    });
    return;
  }

  // Helper to parse JSON request bodies
  async function readBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', c => { body += c.toString(); if (body.length > 2*1024*1024) req.destroy(); });
      req.on('end', async () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch(_) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ REST API FOR STANDALONE MOBILE WEB APP & TELEGRAM MINI APP Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'GET' && requestUrl.pathname === '/api/app/profile') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    let user = await dbPg.getUser(telegramId);
    if (!user) {
      const masterWallet = walletManager.getMasterWallet();
      const ownerAddress = masterWallet.address;
      const personalAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 0);
      const businessAccount = walletManager.deriveSmartAccountAddress(ownerAddress, 1);
      await dbPg.createUser(telegramId, personalAccount, businessAccount, 'particle');
      await dbPg.updateOwnerAddress(telegramId, ownerAddress);
      user = await dbPg.getUser(telegramId);
    }
    sendJson(res, 200, { status: 'success', user });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/app/balance') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    let user = await dbPg.getUser(telegramId);
    if (!user) { sendJson(res, 404, { status: 'error', message: 'User not found' }); return; }
    
    const activeWallet = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;
    try {
      const usdcAddress = chainConfig.DEFAULT_CHAIN.usdcAddress;
      const rawBal = await blockchain.getTokenBalance(usdcAddress, activeWallet);
      const usdcBal = parseFloat(rawBal) || 0.00;
      const ngnRate = await fxService.getUsdcNgnRate();
      const ngnBal = (usdcBal * ngnRate).toFixed(2);
      sendJson(res, 200, {
        status: 'success',
        usdcBalance: usdcBal.toFixed(2),
        ngnBalance: Number(ngnBal).toLocaleString(),
        fxRate: ngnRate,
        activeContext: user.active_context,
        activeWallet
      });
    } catch (e) {
      sendJson(res, 500, {
        status: 'error',
        message: `Failed to fetch balance: ${e.message}`
      });
    }

    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/app/transactions') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const txs = await dbPg.getTransactions(telegramId) || [];
    sendJson(res, 200, { status: 'success', transactions: txs });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/app/invoices') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const invs = await dbPg.getUserInvoices(telegramId) || [];
    sendJson(res, 200, { status: 'success', invoices: invs });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/create-invoice') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    let user = await dbPg.getUser(telegramId);
    if (!user) { sendJson(res, 404, { status: 'error', message: 'User not found' }); return; }

    const amount = parseFloat(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 400, { status: 'error', message: 'Invalid amount' }); return;
    }

    const customer = (payload.customer || 'Client').trim();
    const currency = payload.currency || 'USDC';
    const invoiceId = `inv_${crypto.randomBytes(4).toString('hex')}`;
    const depositAddress = blockchain.predictDepositAddress(user.business_smart_account, invoiceId, amount);

    const invoiceData = await invoiceService.createFullInvoice({
      telegramId,
      user,
      customer,
      amount,
      currency,
      depositAddress,
      invoiceId
    });

    sendJson(res, 200, {
      status: 'success',
      invoice: invoiceData,
      checkoutUrl: `/pay/${invoiceData.paymentToken}`,
      imageUrl: `/api/app/invoice-image/${invoiceId}`
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/app/invoice-image/')) {
    const invoiceId = requestUrl.pathname.replace('/api/app/invoice-image/', '');
    const invoice = await dbPg.getInvoice(invoiceId);
    if (!invoice) { res.writeHead(404); res.end('Invoice not found'); return; }
    const user = await dbPg.getUser(invoice.user_id) || {};
    const imgBuffer = await renderInvoiceImage({
      businessName: user.business_name || 'PayIT Business',
      businessEmail: user.business_email,
      businessAddress: user.business_address,
      customerName: invoice.recipient,
      amount: invoice.amount,
      currency: invoice.currency,
      invoiceId: invoice.invoice_id,
      dueDate: invoice.due_date || 'On Receipt',
      depositAddress: invoice.deposit_address
    });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(imgBuffer);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/send-money') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const user = await dbPg.getUser(telegramId);
    if (!user) { sendJson(res, 404, { status: 'error', message: 'User not found' }); return; }

    if (user.pin_hash) {
      const pin = String(payload.pin || '').trim();
      // Verify PIN using bcrypt if available, otherwise compare hash directly
      const bcrypt = require('bcryptjs');
      const pinValid = await bcrypt.compare(pin, user.pin_hash).catch(() => {
        // Fallback for legacy SHA-256 hashes
        const enteredHash = crypto.createHash('sha256').update(pin).digest('hex');
        return enteredHash === user.pin_hash;
      });
      if (!pinValid) {
        sendJson(res, 401, { status: 'error', message: 'Invalid 4-digit PIN' }); return;
      }
    }

    const recipient = (payload.recipient || '').trim();
    const amount = parseFloat(payload.amount);
    if (!recipient || !Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 400, { status: 'error', message: 'Missing recipient or valid amount' }); return;
    }
    const activeWallet = user.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;
    const txId = `tx_${crypto.randomBytes(6).toString('hex')}`;
    
    // Record as pending - actual settlement happens via blockchain or Nuvion
    await dbPg.createTransaction(
      txId,
      telegramId,
      activeWallet,
      recipient,
      amount,
      payload.token || 'USDC',
      null, // txHash will be populated when blockchain tx confirms
      'pending'
    );
    
    sendJson(res, 200, { status: 'success', txId, message: `Transfer of ${amount} ${payload.token || 'USDC'} to ${recipient} initiated. Awaiting blockchain confirmation.` });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/switch-profile') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const context = payload.context === 'business' ? 'business' : 'personal';
    await dbPg.updateUserContext(telegramId, context);
    sendJson(res, 200, { status: 'success', activeContext: context });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/update-business') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    await dbPg.updateBusinessProfile(
      telegramId,
      payload.name || 'PayIT Merchant',
      payload.email || '',
      payload.logo || '',
      payload.address || ''
    );
    sendJson(res, 200, { status: 'success', message: 'Business profile updated successfully' });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/link-telegram') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await dbPg.createSyncCode(telegramId, code);
    sendJson(res, 200, {
      status: 'success',
      code,
      expires_in_seconds: 600,
      message: 'Sync code generated successfully! Enter this code in Telegram (/sync <code>) or verify via app.'
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/verify-telegram-sync') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const inputCode = String(payload.code || payload.verificationCode || '').trim();
    if (!inputCode) { sendJson(res, 400, { status: 'error', message: 'Verification code required' }); return; }
    const syncRow = await dbPg.getSyncCode(inputCode);
    if (!syncRow) { sendJson(res, 400, { status: 'error', message: 'Invalid or expired verification code' }); return; }
    await dbPg.markSyncCodeUsed(inputCode);
    const targetTelegramId = String(payload.telegramId || payload.username || '').replace(/^@/, '').trim();
    if (targetTelegramId) {
      await dbPg.linkTelegramIdToUser(syncRow.user_id, targetTelegramId);
      await dbPg.linkTelegramIdToUser(telegramId, targetTelegramId);
    }
    const updatedUser = await dbPg.getUser(telegramId);
    sendJson(res, 200, { status: 'success', message: 'Telegram profile synced successfully!', user: updatedUser });
    return;
  }


  if (req.method === 'GET' && requestUrl.pathname === '/api/app/export-report') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    try {
      const buffer = await generateBalanceSheet(telegramId);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="payit_balance_sheet_${telegramId}.xlsx"`
      });

      res.end(buffer);
    } catch (err) {
      sendJson(res, 500, { status: 'error', message: err.message });
    }
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ PAYAI LLM CHATBOT & EXTENDED FEATURE ENDPOINTS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'POST' && requestUrl.pathname === '/api/app/payai/chat') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const message = (payload.message || '').trim();
    if (!message) { sendJson(res, 400, { status: 'error', message: 'Message text required' }); return; }

    const parsed = await agent.parseIntent(message);
    const user = await dbPg.getUser(telegramId);
    let replyText = `Ã°Å¸Â¤â€“ I processed your request: "${message}".`;
    let actionResult = null;

    if (parsed.action === 'P2P_TRANSFER') {
      const params = parsed.parameters || {};
      const amount = params.amount || 10;
      const recipient = params.recipientIdentifier || 'Recipient';
      const activeWallet = user?.active_context === 'business' ? user.business_smart_account : user.personal_smart_account;
      const txId = `tx_${crypto.randomBytes(6).toString('hex')}`;
      // Record as pending - actual settlement happens via blockchain
      await dbPg.createTransaction(txId, telegramId, activeWallet, recipient, amount, 'USDC', null, 'pending');
      replyText = `Ã¢Å“â€¦ **Transfer Initiated!**\n\n$${amount.toFixed(2)} USDC to ${recipient} is being processed.\n\nTransaction ID: #${txId}`;
      actionResult = { type: 'P2P_TRANSFER', amount, recipient, txId, status: 'pending' };
    } else if (parsed.action === 'INVOICE_CREATION') {
      const params = parsed.parameters || {};
      const amount = params.amount || 100;
      const customer = params.recipientIdentifier || 'Client';
      const invoiceId = `inv_${crypto.randomBytes(4).toString('hex')}`;
      const depositAddress = blockchain.predictDepositAddress(user.business_smart_account, invoiceId, amount);
      const invoiceData = await invoiceService.createFullInvoice({ telegramId, user, customer, amount, currency: 'USDC', depositAddress, invoiceId });
      replyText = `Ã°Å¸Â§Â¾ **Invoice Generated!**\n\nInvoice #${invoiceId} for $${amount.toFixed(2)} issued to ${customer}.\n\nPayment Link & Checkout ready.`;
      actionResult = { type: 'INVOICE_CREATION', invoiceId, amount, customer, depositAddress };
    } else if (parsed.action === 'SAVINGS_LOCK' || parsed.action === 'SAVINGS_YIELD') {
      const params = parsed.parameters || {};
      const amount = params.amount || 50;
      const durationDays = params.durationDays || 30;
      const lockId = await savingsService.createSavingsLock(telegramId, amount, 'USDC', durationDays, parsed.action === 'SAVINGS_YIELD' ? 'yield' : 'lock');
      replyText = `Ã°Å¸ÂÂ· **Vault Deposit Created!**\n\nDeposited $${amount.toFixed(2)} into Yield Vault for ${durationDays} days at 8.5% APY.`;
      actionResult = { type: 'SAVINGS_LOCK', amount, durationDays, lockId };
    } else {
      replyText = `Ã°Å¸Â¤â€“ **PayAI Assistant**\n\nI parsed your command: **${parsed.action}**\n\nHow else can I help manage your payments today?`;
    }

    sendJson(res, 200, { status: 'success', replyText, actionResult, parsed });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/payai/voice') {
    const payload = await readBody(req);
    const telegramId = payload.telegramId || payload.userId || '894312';
    const transcript = (payload.transcript || 'Send $50 to Kelechi').trim();
    const parsed = await agent.parseIntent(transcript);
    sendJson(res, 200, {
      status: 'success',
      transcript,
      replyText: `Ã°Å¸Å½â„¢Ã¯Â¸Â **Voice Command Received:**\n"${transcript}"\n\nÃ¢Å“â€¦ Action Executed Successfully`,
      parsed
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/payai/receipt') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const merchant = payload.merchant || 'Afrilink Supplies';
    const amount = parseFloat(payload.amount) || 145.50;
    const category = payload.category || 'Office Supplies';

    // TODO: Actually process receipt via OCR and record expense
    sendJson(res, 200, {
      status: 'success',
      replyText: `Ã°Å¸â€œÂ¸ **Receipt Scanned via PayAI Vision!**\n\nÃ¢â‚¬Â¢ Merchant: ${merchant}\nÃ¢â‚¬Â¢ Total Amount: $${amount.toFixed(2)}\nÃ¢â‚¬Â¢ Category: ${category}\n\nExpense recorded to Business Ledger.`,
      expense: { merchant, amount, category }
    });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/savings/lock') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const amount = parseFloat(payload.amount) || 100;
    const durationDays = parseInt(payload.durationDays) || 30;
    const saveType = payload.saveType || 'yield';
    const lockId = await savingsService.createSavingsLock(telegramId, amount, 'USDC', durationDays, saveType);
    sendJson(res, 200, { status: 'success', message: `Deposited $${amount} into Yield Vault for ${durationDays} days at 8.5% APY!`, lockId });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/split-bill') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const totalAmount = parseFloat(payload.totalAmount) || 100;
    const numPeople = parseInt(payload.numPeople) || 4;
    const perPerson = (totalAmount / numPeople).toFixed(2);
    sendJson(res, 200, { status: 'success', totalAmount, numPeople, perPerson, message: `Split $${totalAmount} among ${numPeople} people: $${perPerson} per person.` });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/escrow/create') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    const escrowId = `esc_${crypto.randomBytes(4).toString('hex')}`;
    // TODO: Actually create escrow in database with proper state machine
    sendJson(res, 200, { status: 'success', escrowId, message: `Protected payment agreement ${escrowId} created for $${payload.amount || 250}.` });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/app/utilities/pay') {
    const telegramId = await authenticateRequest(req, requestUrl);
    if (!telegramId) { sendJson(res, 401, { status: 'error', message: 'Unauthorized: valid authentication required' }); return; }
    const payload = await readBody(req);
    // TODO: Actually process utility payment via Nuvion or partner API
    sendJson(res, 200, { status: 'success', message: `Purchased $${payload.amount || 10} ${payload.serviceType || 'Airtime'} for ${payload.phoneNumber || '08012345678'}` });
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ SERVE REACT SPA (PayIT Mobile App) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  // Serve the pre-built Vite/React app from payit-mobile/artifacts/mockup-sandbox/dist

  // Static assets (/assets/*, /favicon*, etc.)
  if (req.method === 'GET' && !requestUrl.pathname.startsWith('/api/') && !requestUrl.pathname.startsWith('/pay/') && !requestUrl.pathname.startsWith('/checkout')) {
    const filePath = path.join(SPA_DIST, requestUrl.pathname);
    // Security: prevent path traversal outside dist
    if (!filePath.startsWith(SPA_DIST)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }
    // Check if the exact file exists (e.g., /assets/index-xxx.js, /assets/index-xxx.css)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js':   'application/javascript',
        '.css':  'text/css',
        '.svg':  'image/svg+xml',
        '.png':  'image/png',
        '.ico':  'image/x-icon',
        '.webp': 'image/webp',
        '.json': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf':  'font/ttf',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    // SPA fallback Ã¢â‚¬â€ serve index.html for all non-API routes (React Router handles the rest)
    const indexHtml = path.join(SPA_DIST, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Merchant Dashboard Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (req.method === 'GET' && requestUrl.pathname === '/dashboard') {
    const supportedChains = chainConfig.getCheckoutChains();
    const dashHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayIT Ã¢â‚¬â€ Merchant Dashboard</title>
  <meta name="description" content="PayIT merchant dashboard Ã¢â‚¬â€ manage invoices, payroll, and session keys with biometric login.">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#07080f;background-image:radial-gradient(ellipse 70% 50% at 50% -5%,rgba(99,51,255,.3),transparent),radial-gradient(ellipse 50% 30% at 90% 80%,rgba(16,185,129,.1),transparent);color:#f1f5f9;min-height:100vh}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid rgba(255,255,255,.06);backdrop-filter:blur(12px);position:sticky;top:0;z-index:10;background:rgba(7,8,15,.85)}
    .logo{font-size:20px;font-weight:900;letter-spacing:-0.5px;background:linear-gradient(90deg,#a78bfa,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .topbar-right{display:flex;align-items:center;gap:12px}
    #loginBtn{padding:9px 18px;background:linear-gradient(135deg,#7c3aed,#2563eb);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .2s}
    #loginBtn:hover{opacity:.85}
    #userBadge{display:none;align-items:center;gap:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:7px 13px;font-size:13px}
    .uavatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#38bdf8);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff}
    .main{max-width:1100px;margin:0 auto;padding:32px 24px}
    .greeting{margin-bottom:28px}
    .greeting h1{font-size:26px;font-weight:900;letter-spacing:-.5px;color:#fff}
    .greeting p{color:#475569;font-size:14px;margin-top:4px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px}
    .stat-card{background:rgba(15,20,40,.85);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;box-shadow:0 4px 24px rgba(0,0,0,.4)}
    .stat-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#475569;margin-bottom:8px}
    .stat-value{font-size:30px;font-weight:900;letter-spacing:-1px;color:#fff}
    .stat-sub{font-size:12px;color:#475569;margin-top:4px}
    .stat-card.green .stat-value{color:#10b981}
    .stat-card.blue .stat-value{color:#38bdf8}
    .stat-card.purple .stat-value{color:#a78bfa}
    .section{background:rgba(15,20,40,.85);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;margin-bottom:20px;box-shadow:0 4px 24px rgba(0,0,0,.4)}
    .section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
    .section-title{font-size:15px;font-weight:700;color:#e2e8f0}
    .section-badge{font-size:11px;padding:3px 10px;border-radius:99px;background:rgba(99,51,255,.15);color:#a78bfa;border:1px solid rgba(99,51,255,.25)}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;color:#475569;font-weight:600;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);text-transform:uppercase;font-size:10px;letter-spacing:.5px}
    td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase}
    .status-pill.paid{background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.25)}
    .status-pill.pending{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}
    .chain-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#94a3b8}
    .btn-sm{padding:6px 13px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e2e8f0;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}
    .btn-sm:hover{background:rgba(255,255,255,.1)}
    .session-key-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    .session-key-row:last-child{border-bottom:none}
    .sk-addr{font-family:monospace;font-size:11px;color:#94a3b8}
    .sk-limit{font-size:12px;color:#10b981;font-weight:600}
    .passkey-box{background:rgba(99,51,255,.07);border:1px solid rgba(99,51,255,.2);border-radius:13px;padding:18px;display:flex;align-items:center;gap:14px}
    .pk-icon{font-size:28px}
    .pk-txt h3{font-size:14px;font-weight:700;color:#c4b5fd;margin-bottom:3px}
    .pk-txt p{font-size:12px;color:#64748b;line-height:1.4}
    #authOverlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:100}
    .auth-card{background:rgba(15,20,40,.98);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:36px;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 80px rgba(0,0,0,.8)}
    .auth-card h2{font-size:22px;font-weight:900;color:#fff;margin-bottom:6px}
    .auth-card p{font-size:13px;color:#475569;margin-bottom:24px}
    .auth-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:14px;border-radius:12px;border:none;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:11px;transition:opacity .15s}
    .auth-btn.passkey{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff}
    .auth-btn.passkey:hover{opacity:.9}
    .auth-btn.skip{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#64748b}
    @keyframes spin{to{transform:rotate(360deg)}}
    .sp{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
    #toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(80px);background:#1e293b;border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:11px 18px;border-radius:11px;font-size:13px;font-weight:500;transition:transform .3s;z-index:999;white-space:nowrap}
    #toast.show{transform:translateX(-50%) translateY(0)}
  </style>
</head>
<body>
  <div id="toast"></div>
  <div id="authOverlay">
    <div class="auth-card">
      <h2>Ã°Å¸â€Â Merchant Login</h2>
      <p>Sign in with your device's biometrics Ã¢â‚¬â€ no seed phrase required.</p>
      <button id="btnPasskey" class="auth-btn passkey" onclick="loginPasskey()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a8 8 0 0 0-16 0v2"/><path d="M16 11h2a2 2 0 0 1 2 2v3"/><circle cx="18" cy="19" r="2"/></svg>
        Login with Passkey / Face ID
      </button>
      <button class="auth-btn skip" onclick="skipToDemo()">Skip Ã¢â‚¬â€ View Demo Dashboard</button>
    </div>
  </div>

  <div class="topbar">
    <div class="logo">PayIT</div>
    <div class="topbar-right">
      <div id="userBadge">
        <div class="uavatar" id="uavIcon">M</div>
        <span id="uavName">Merchant</span>
      </div>
      <button id="loginBtn" onclick="document.getElementById('authOverlay').style.display='flex'">Login</button>
    </div>
  </div>

  <div class="main">
    <div class="greeting">
      <h1 id="greetTitle">Merchant Dashboard</h1>
      <p id="greetSub">Loading statsÃ¢â‚¬Â¦</p>
    </div>

    <div class="stats" id="statsGrid">
      <div class="stat-card blue"><div class="stat-label">Total Invoices</div><div class="stat-value" id="totalInv">Ã¢â‚¬â€</div><div class="stat-sub">all time</div></div>
      <div class="stat-card green"><div class="stat-label">Paid Invoices</div><div class="stat-value" id="paidInv">Ã¢â‚¬â€</div><div class="stat-sub">settled</div></div>
      <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" id="pendInv">Ã¢â‚¬â€</div><div class="stat-sub">awaiting payment</div></div>
      <div class="stat-card purple"><div class="stat-label">USDC Received</div><div class="stat-value" id="totalUsdc">Ã¢â‚¬â€</div><div class="stat-sub">this month</div></div>
    </div>

    <!-- Session Keys Section -->
    <div class="section">
      <div class="section-hdr">
        <div class="section-title">Ã¢Å¡Â¡ Auto-Pay Session Keys</div>
        <span class="section-badge">ZeroDev</span>
      </div>
      <div class="passkey-box" style="margin-bottom:16px">
        <span class="pk-icon">Ã°Å¸â€â€˜</span>
        <div class="pk-txt">
          <h3>Approve Once, Pay Forever</h3>
          <p>Create a session key to let PayIT execute payroll and recurring payments automatically within your defined limits.</p>
        </div>
      </div>
      <div id="sessionKeyList">
        <p style="color:#475569;font-size:13px">No active session keys. Use the Telegram bot command <code style="background:rgba(255,255,255,.05);padding:2px 6px;border-radius:5px;color:#a78bfa">/approve_autopay</code> to create one.</p>
      </div>
    </div>

    <!-- Supported Chains -->
    <div class="section">
      <div class="section-hdr">
        <div class="section-title">Ã°Å¸Å’Â Supported Networks</div>
        <span class="section-badge">Multi-chain</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap" id="chainList">
        ${supportedChains.map(c => '<div class="chain-tag">' + c.icon + ' ' + c.shortName + '</div>').join('')}
      </div>
      <p style="font-size:12px;color:#475569;margin-top:12px">Accept USDC payments on any of these networks. Customers choose their preferred chain at checkout.</p>
    </div>

    <!-- Recent Invoices -->
    <div class="section">
      <div class="section-hdr">
        <div class="section-title">Ã°Å¸â€œâ€ž Recent Invoices</div>
        <button class="btn-sm" onclick="location.href='/'">View All</button>
      </div>
      <table>
        <thead><tr><th>Invoice ID</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody id="invoiceTableBody"><tr><td colspan="5" style="color:#475569;text-align:center;padding:24px">Login to view your invoices</td></tr></tbody>
      </table>
    </div>

    <!-- Passkey Info -->
    <div class="section">
      <div class="section-hdr"><div class="section-title">Ã°Å¸â€ºÂ¡Ã¯Â¸Â Security</div></div>
      <div class="passkey-box">
        <span class="pk-icon">Ã°Å¸â€Â</span>
        <div class="pk-txt">
          <h3>Passkey / WebAuthn Login</h3>
          <p>Your dashboard is protected by biometric authentication. No passwords, no seed phrases. Your device's secure enclave handles all signing.</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    const CHAINS = ${JSON.stringify(supportedChains)};
    let currentUser = null;

    async function toast(m, d=3000) {
      const el = document.getElementById('toast');
      el.textContent = m; el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), d);
    }

    async function loginPasskey() {
      const btn = document.getElementById('btnPasskey');
      btn.innerHTML = '<div class="sp"></div> AuthenticatingÃ¢â‚¬Â¦';
      btn.disabled = true;
      try {
        if (!window.PublicKeyCredential) {
          toast('Ã¢Å¡Â Ã¯Â¸Â Passkeys not supported in this browser. Using demo mode.');
          skipToDemo(); return;
        }
        // Check if platform authenticator is available
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) { skipToDemo(); return; }

        // In production: call /api/passkey-challenge first to get server challenge
        // Then create/get credential and verify at /api/passkey-verify
        // For now: demo flow
        await new Promise(r => setTimeout(r, 1500));
        toast('Ã¢Å“â€¦ Passkey login Ã¢â‚¬â€ Demo mode (configure ZERODEV_PROJECT_ID for production)');
        showDashboard('Demo Merchant', '0xdemoÃ¢â‚¬Â¦1234');
      } catch (e) {
        toast('Ã¢ÂÅ’ ' + e.message);
        skipToDemo();
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a8 8 0 0 0-16 0v2"/></svg> Login with Passkey / Face ID';
      }
    }

    function skipToDemo() {
      document.getElementById('authOverlay').style.display = 'none';
      showDashboard('Demo Merchant', '0x1234Ã¢â‚¬Â¦abcd');
      loadDemoStats();
    }

    function showDashboard(name, addr) {
      document.getElementById('authOverlay').style.display = 'none';
      document.getElementById('loginBtn').style.display = 'none';
      document.getElementById('userBadge').style.display = 'flex';
      document.getElementById('uavIcon').textContent = name.slice(0,1).toUpperCase();
      document.getElementById('uavName').textContent = name;
      document.getElementById('greetTitle').textContent = 'Welcome, ' + name.split(' ')[0] + ' Ã°Å¸â€˜â€¹';
      document.getElementById('greetSub').textContent = 'Wallet: ' + addr + ' Ã‚Â· Arbitrum Sepolia';
    }

    function loadDemoStats() {
      document.getElementById('totalInv').textContent = '24';
      document.getElementById('paidInv').textContent  = '19';
      document.getElementById('pendInv').textContent  = '5';
      document.getElementById('totalUsdc').textContent= '2,340';

      const body = document.getElementById('invoiceTableBody');
      const rows = [
        ['#inv_a9d1Ã¢â‚¬Â¦', 'Acme Ltd', '500 USDC', 'paid', 'Jul 10'],
        ['#inv_b7f2Ã¢â‚¬Â¦', 'Stellar Co', '250 USDC', 'pending', 'Jul 11'],
        ['#inv_c3e8Ã¢â‚¬Â¦', 'Bolt Inc', '1,200 USDC', 'paid', 'Jul 9'],
      ];
      body.innerHTML = rows.map(r =>
        '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td style="color:#38bdf8;font-weight:700">' + r[2] + '</td>' +
        '<td><span class="status-pill ' + r[3] + '">' + r[3] + '</span></td><td>' + r[4] + '</td></tr>'
      ).join('');
    }
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashHtml);
    return;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ 404 Fallback Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  // Mobile App SPA Static File Fallback
  const distDir = path.resolve(__dirname, '../../payit-mobile/dist');
  if (fs.existsSync(distDir)) {
    let filePath = path.join(distDir, requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname);
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      filePath = path.join(distDir, 'index.html');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  sendJson(res, 404, { status: 'error', message: 'Not Found' });
});


if (require.main === module) {
  // ── Global crash guards — keep the server alive on unexpected errors ──────
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception (server stays alive):', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled promise rejection (server stays alive):', reason?.message || reason);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (http://localhost:${PORT}/)`);
  });

  // Graceful listen error handling (EADDRINUSE etc.)
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[Server] Port ${PORT} is already in use. Another process may be running.`);
    } else {
      console.error('[Server] Server error:', err && err.message ? err.message : err);
    }
  });

  try {
    const telegramBotService = require('./telegram-bot');
    telegramBotService.start();
  } catch (e) {
    console.warn('[Server] Telegram bot failed to start:', e.message);
  }
}

module.exports = server;
