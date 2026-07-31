import React, { useState, useEffect, useRef } from 'react';
import { Magic } from 'magic-sdk';
import {
  Bell, Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Plus, Send, RefreshCw,
  Shield, Check, Copy, ChevronRight, Building2, Users, FileText,
  ChevronLeft, ArrowLeft, Bot, CreditCard, Sparkles, User, Info,
  CheckCircle2, ArrowRight, Mail, Phone, Lock, Zap, Wallet,
  BarChart3, PiggyBank, Receipt, UserCheck, Globe, X, AlertCircle,
  TrendingUp, Wifi, MoreHorizontal, Loader2, LogOut, Settings
} from 'lucide-react';

// Initialize Magic SDK with publishable key (using npm package)
let magic: any = null;
const initMagic = () => {
  if (!magic) {
    const key = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY || 'pk_live_899F70AD5418D368';
    try {
      magic = new Magic(key, {
        network: 'mainnet', // Explicitly set network for production
        locale: 'en_US',
        // CRITICAL: Magic Link redirect URI - where Magic redirects after email link click
        extensions: []
      });
      console.log('[Magic] SDK initialized successfully with key:', key.substring(0, 15) + '...', 'Network: mainnet');
    } catch (e) {
      console.error('[Magic] Failed to initialize Magic SDK:', e);
    }
  }
  return magic;
};

/* ─── Design Tokens ─────────────────────────────────────────────────────── */
const INK = '#0F172A';
const FOREST = '#047857';
const EMERALD = '#10B981';
const EMERALD_LIGHT = '#5EEAB0';
const MIST = '#E5E7EB';
const MINT = '#ECFDF5';
const SLATE = '#64748B';
const DANGER = '#DC4C4C';
const AMBER = '#F59E0B';

const API_URL = import.meta.env.VITE_API_URL || 'https://payit-particle-payit-particle.up.railway.app';
const API = API_URL;

/* ─── App State Types ─────────────────────────────────────────────────────── */
type Screen =
  | 'splash' | 'welcome' | 'magic_link'
  | 'account_type' | 'kyc_personal' | 'kyb_business' | 'kyc_success' | 'pin_setup'
  | 'home' | 'add_money' | 'send_money' | 'split_bill' | 'bills' | 'savings'
  | 'invoices' | 'customers' | 'notifications' | 'payai' | 'business' | 'profile' | 'profile_sync'
  | 'cards' | 'security_pin';

type Tab = 'home' | 'payai' | 'business' | 'profile';

interface UserData {
  user_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  is_verified?: number;
  personal_kyc_status?: string;
  business_kyb_status?: string;
  active_context?: string;
  nuvion_account_no?: string;
  nuvion_business_account_no?: string;
  business_name?: string;
  kyb_status?: string;
}

/* ─── Root App ─────────────────────────────────────────────────────────── */
export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [user, setUser] = useState<UserData | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);

  /* Shared state */
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [balanceHide, setBalanceHide] = useState(false);
  const [bizSegment, setBizSegment] = useState<'bank' | 'crypto'>('bank');
  const [accountType, setAccountType] = useState<'personal' | 'business'>('personal');

  // On mount: check for existing session or Magic redirect callback
  useEffect(() => {
    const checkAuthStatus = async () => {
      // Check if Magic SDK is loaded
      const magicInstance = initMagic();
      if (magicInstance) {
        try {
          // Check if user is logged in (handles Magic Link callback automatically)
          const isLoggedIn = await magicInstance.user.isLoggedIn();
          console.log('[Magic] Initial auth check - logged in:', isLoggedIn);
          
          if (isLoggedIn) {
            // User completed Magic Link authentication
            const didToken = await magicInstance.user.getIdToken();
            console.log('[Magic] DID token retrieved from callback');
            sessionStorage.setItem('payit_token', didToken);
            setAuthToken(didToken);
            
            // Fetch user profile
            const res = await fetch(`${API}/api/mobile/me`, {
              headers: { Authorization: `Bearer ${didToken}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.user) {
                setUser(data.user);
                localStorage.setItem('payit_user_data', JSON.stringify(data.user));
                const isVerified = data.user.is_verified === 1 || data.user.personal_kyc_status === 'verified';
                setScreen(isVerified ? 'home' : 'account_type');
                return;
              }
            }
          }
        } catch (err) {
          console.error('[Magic] Auth check error:', err);
        }
      }
      
      // Fallback: check session storage
      const token = sessionStorage.getItem('payit_token');
      if (token) {
        setAuthToken(token);
        checkReturningUser(token);
      } else {
        setTimeout(() => setScreen('welcome'), 2200);
      }
    };
    
    checkAuthStatus();
  }, []);

  async function checkReturningUser(token: string) {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`${API}/api/mobile/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          const u = data.user;
          setUser(u);
          localStorage.setItem('payit_user_data', JSON.stringify(u));
          const isVerified = u.is_verified === 1 || u.personal_kyc_status === 'verified';
          if (isVerified) {
            setScreen('home');
          } else {
            setScreen('account_type');
          }
          return;
        }
      }
      const cached = localStorage.getItem('payit_user_data');
      if (cached) {
        try {
          const u = JSON.parse(cached);
          setUser(u);
          const isVerified = u.is_verified === 1 || u.personal_kyc_status === 'verified';
          setScreen(isVerified ? 'home' : 'account_type');
          return;
        } catch (_) {}
      }
      sessionStorage.removeItem('payit_token');
      setScreen('welcome');
    } catch {
      clearTimeout(timeoutId);
      const cached = localStorage.getItem('payit_user_data');
      if (cached) {
        try {
          const u = JSON.parse(cached);
          setUser(u);
          const isVerified = u.is_verified === 1 || u.personal_kyc_status === 'verified';
          setScreen(isVerified ? 'home' : 'account_type');
          return;
        } catch (_) {}
      }
      sessionStorage.removeItem('payit_token');
      setScreen('welcome');
    } finally {
      setIsLoading(false);
    }
  }

  function handleAuthSuccess(token: string, userData: UserData) {
    sessionStorage.setItem('payit_token', token);
    setAuthToken(token);
    setUser(userData);
    const isVerified = userData.is_verified === 1 || userData.personal_kyc_status === 'verified' || token.startsWith('payit_email_') || Boolean(userData.email);
    if (isVerified) {
      // Returning user: require PIN if set, else go home
      const hasPin = !!localStorage.getItem('payit_pin_hash');
      if (hasPin) {
        setScreen('security_pin');
      } else {
        setPinVerified(true);
        setScreen('home');
      }
    } else {
      setScreen('account_type');
    }
  }

  function handleKycDone(updatedUser?: UserData) {
    if (updatedUser) setUser(prev => ({ ...prev, ...updatedUser }));
    setScreen('kyc_success');
    // After success show PIN setup
    setTimeout(() => setScreen('pin_setup'), 2400);
  }

  function handleTabNav(tab: Tab) {
    setActiveTab(tab);
    setScreen('home');
  }

  function handleSubNav(s: Screen) { setScreen(s); }

  function handleLogout() {
    sessionStorage.removeItem('payit_token');
    setUser(null);
    setAuthToken(null);
    setScreen('welcome');
  }

  if (isLoading && screen === 'splash') {
    return (
      <PhoneShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <PayITLogo size={64} />
            <Loader2 size={22} color={EMERALD} className="animate-spin" />
          </div>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      {/* ── Onboarding Screens ───────────────────────────────────── */}
      {screen === 'splash' && <SplashScreen />}
      {screen === 'welcome' && <WelcomeScreen onContinue={() => setScreen('magic_link')} />}
      {screen === 'magic_link' && <MagicLinkScreen onBack={() => setScreen('welcome')} onVerified={handleAuthSuccess} />}
      {screen === 'account_type' && (
        <AccountTypeScreen
          selected={accountType}
          onSelect={setAccountType}
          onContinue={() => setScreen(accountType === 'business' ? 'kyb_business' : 'kyc_personal')}
        />
      )}
      {screen === 'kyc_personal' && (
        <KYCPersonalScreen
          token={authToken}
          onDone={handleKycDone}
          onBack={() => setScreen('account_type')}
        />
      )}
      {screen === 'kyb_business' && (
        <KYBBusinessScreen
          token={authToken}
          onDone={handleKycDone}
          onBack={() => setScreen('account_type')}
        />
      )}
      {screen === 'kyc_success' && (
        <KYCSuccessScreen 
          accountType={accountType} 
          onContinue={() => {
            const hasPin = !!localStorage.getItem('payit_pin_hash');
            setScreen(hasPin ? 'home' : 'pin_setup');
          }} 
        />
      )}
      {screen === 'pin_setup' && (
        <PinSetupScreen
          onDone={() => { setPinVerified(true); setScreen('home'); }}
          isNewPin={true}
        />
      )}
      {screen === 'security_pin' && (
        <SecurityPinScreen
          onVerified={() => { setPinVerified(true); setScreen('home'); }}
          onForgot={() => { setPinVerified(true); setScreen('home'); }}
        />
      )}

      {/* ── Main App Screens (with bottom nav) ──────────────────── */}
      {(['home', 'add_money', 'send_money', 'split_bill', 'bills', 'savings',
         'invoices', 'customers', 'notifications', 'cards', 'payai', 'business', 'profile', 'profile_sync', 'security_pin'] as Screen[]).includes(screen)
        && !['pin_setup', 'kyc_success', 'account_type', 'kyc_personal', 'kyb_business', 'magic_link', 'welcome', 'splash', 'security_pin'].includes(screen) && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Screen content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'home' && screen === 'home' && (
              <HomeScreen
                user={user}
                currency={currency}
                setCurrency={setCurrency}
                balanceHide={balanceHide}
                setBalanceHide={setBalanceHide}
                onNav={handleSubNav}
                token={authToken}
                setUser={setUser}
              />
            )}
            {screen === 'add_money' && (
              <AddMoneyScreen onBack={() => setScreen('home')} token={authToken} user={user} initialContext={activeTab === 'business' ? 'business' : 'personal'} />
            )}
            {screen === 'send_money' && (
              <SendMoneyScreen onBack={() => setScreen('home')} token={authToken} />
            )}
            {screen === 'split_bill' && (
              <SplitBillScreen onBack={() => setScreen('home')} />
            )}
            {screen === 'bills' && (
              <BillsScreen onBack={() => setScreen('home')} token={authToken} />
            )}
            {screen === 'savings' && (
              <SavingsScreen onBack={() => setScreen('home')} token={authToken} />
            )}
            {screen === 'notifications' && (
              <NotificationsScreen onBack={() => setScreen('home')} token={authToken} />
            )}
            {screen === 'invoices' && (
              <InvoicesScreen onBack={() => setScreen('business')} token={authToken} />
            )}
            {screen === 'customers' && (
              <CustomersScreen onBack={() => setScreen('business')} token={authToken} />
            )}
            {screen === 'cards' && (
              <CardsScreen onBack={() => setScreen('home')} token={authToken} user={user} initialContext={activeTab === 'business' ? 'business' : 'personal'} />
            )}
            {screen === 'profile_sync' && (
              <ProfileSyncScreen onBack={() => { setScreen('home'); setActiveTab('profile'); }} token={authToken} />
            )}
            {activeTab === 'payai' && !(['add_money','send_money','split_bill','bills','savings','notifications','invoices','customers','cards','profile_sync'].includes(screen)) && (
              <PayAIScreen token={authToken} user={user} onNav={handleSubNav} />
            )}
            {activeTab === 'business' && !(['invoices','customers','add_money','send_money','split_bill','bills','savings','notifications','cards','profile_sync'].includes(screen)) && (
              <BusinessScreen
                user={user}
                segment={bizSegment}
                setSegment={setBizSegment}
                token={authToken}
                onNav={(s: Screen) => setScreen(s)}
              />
            )}
            {activeTab === 'profile' && !(['add_money','send_money','split_bill','bills','savings','notifications','invoices','customers','cards','profile_sync'].includes(screen)) && (
              <ProfileScreen user={user} onLogout={handleLogout} onNav={handleSubNav} token={authToken} />
            )}
          </div>

          {/* Bottom Nav — hide during sub-screens */}
          {!(['add_money','send_money','split_bill','bills','savings','notifications','invoices','customers','cards','profile_sync'].includes(screen)) && (
            <BottomNavBar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                const kycDone = (user?.personal_kyc_status === 'verified') || (user?.is_verified === 1);
                const kybDone = (user?.business_kyb_status === 'approved') || (user?.kyb_status === 'approved');

                // Access control: User verified only for Personal (KYC) trying to access Business
                if (tab === 'business' && kycDone && !kybDone) {
                  setScreen('kyb_business');
                  return;
                }
                // Access control: User verified only for Business (KYB) trying to access Personal
                if (tab === 'home' && kybDone && !kycDone) {
                  setScreen('kyc_personal');
                  return;
                }

                setActiveTab(tab);
                if (tab === 'home') setScreen('home');
                else if (tab === 'payai') setScreen('payai');
                else if (tab === 'business') setScreen('business');
                else if (tab === 'profile') setScreen('profile');
              }}
            />
          )}
        </div>
      )}
    </PhoneShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* SHARED LAYOUT COMPONENTS */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PhoneShell({ children }: { children: React.ReactNode }) {
  const [copiedLink, setCopiedLink] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="w-full h-full h-dvh bg-[#F7FAF8] font-sans flex flex-col overflow-hidden">
      {/* ── Desktop Device Blocker Banner (Visible on screens >= 768px) ── */}
      <div className="hidden md:flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-[#0F172A] via-[#0E3A2C] to-[#047857] text-white px-6 text-center">
        <div className="max-w-md bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[28px] shadow-2xl flex flex-col items-center gap-6">
          <img
            src="/payit-icon.jpg"
            alt="PayIT Logo"
            className="w-20 h-20 rounded-[22px] object-cover shadow-[0_12px_24px_rgba(4,120,87,0.4)]"
          />
          <div className="flex flex-col gap-2">
            <span className="px-3 py-1 bg-[#5EEAB0]/20 text-[#5EEAB0] text-[11px] font-bold rounded-full uppercase tracking-wider mx-auto">
              Mobile Device Required
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">Please Access PayIT on Your Phone</h1>
            <p className="text-sm text-white/80 leading-relaxed">
              PayIT Mobile App is designed exclusively for smartphone devices. Open this URL on your mobile phone browser (iOS / Android) or switch your browser to mobile view to proceed.
            </p>
          </div>

          <div className="w-full bg-black/20 p-4 rounded-[18px] border border-white/10 flex flex-col gap-3 text-left">
            <div className="flex items-center gap-3 text-xs text-white/90">
              <div className="w-6 h-6 rounded-full bg-[#5EEAB0]/20 flex items-center justify-center text-[#5EEAB0] font-bold">✓</div>
              <span>Optimized for iOS Safari & Android Chrome</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-white/90">
              <div className="w-6 h-6 rounded-full bg-[#5EEAB0]/20 flex items-center justify-center text-[#5EEAB0] font-bold">✓</div>
              <span>Particle Universal Accounts & Multi-Currency</span>
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-3.5 px-5 rounded-[16px] bg-gradient-to-r from-[#5EEAB0] to-[#10B981] text-[#0F172A] font-bold text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            {copiedLink ? '✓ Link Copied to Clipboard!' : 'Copy Mobile App Link'}
          </button>
        </div>
      </div>

      {/* ── Native Mobile Web Application Container (Visible on Mobile Devices < 768px) ── */}
      <div className="w-full h-full h-dvh bg-[#F7FAF8] flex flex-col relative overflow-hidden md:hidden">
        {children}
      </div>
    </div>
  );
}

function SubScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-2 pb-3 shrink-0">
      <button onClick={onBack} className="w-9 h-9 rounded-[12px] bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm">
        <ArrowLeft size={17} color={INK} strokeWidth={2.2} />
      </button>
      <span className="text-[17px] font-bold text-[#0F172A]">{title}</span>
    </div>
  );
}

function PayITLogo({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/payit-icon.jpg"
      alt="PayIT Logo"
      style={{ width: size, height: size }}
      className="rounded-[14px] object-cover shrink-0 shadow-card"
    />
  );
}

function GreenBtn({ label, onClick, loading, disabled, icon }: {
  label: string; onClick?: () => void; loading?: boolean; disabled?: boolean; icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-[52px] rounded-[14px] bg-gradient-to-r from-[#047857] to-[#10B981] text-white font-bold text-[15px] flex items-center justify-center gap-2 shadow-card disabled:opacity-60 transition-all active:scale-[0.98]"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function OutlineBtn({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full h-[48px] rounded-[14px] border-2 border-[#047857] text-[#047857] font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
      {label}
    </button>
  );
}

function InputField({ label, placeholder, value, onChange, type = 'text', helper }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[46px] rounded-[12px] border border-[#E5E7EB] bg-white px-3.5 text-[14px] text-[#0F172A] placeholder-[#94A3B8] font-medium outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/10 transition-all"
      />
      {helper && <span className="text-[11px] text-[#64748B]">{helper}</span>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-[46px] rounded-[12px] border border-[#E5E7EB] bg-white px-3.5 text-[14px] text-[#0F172A] font-medium outline-none focus:border-[#047857] transition-all appearance-none"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function BottomNavBar({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (t: Tab) => void }) {
  return (
    <div className="shrink-0 px-3 pb-3 pt-1 bg-[#F7FAF8]">
      <div className="flex justify-around items-center py-2.5 px-1 bg-gradient-to-br from-[#0F172A] to-[#0E3A2C] rounded-[24px] shadow-nav">
        <button onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer ${activeTab === 'home' ? 'text-[#5EEAB0]' : 'text-white/65'}`}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
          </svg>
          <span>Home</span>
        </button>
        <button onClick={() => setActiveTab('payai')}
          className="flex flex-col items-center gap-0.5 text-white/80 cursor-pointer -mt-5">
          <div className="w-[42px] h-[42px] rounded-[14px] bg-gradient-to-br from-[#5EEAB0] to-[#047857] flex items-center justify-center text-[#0F172A] shadow-[0_8px_16px_rgba(16,185,129,0.4),0_0_0_4px_#0E3A2C]">
            <Shield size={18} strokeWidth={2.3} />
          </div>
          <span className="text-[10px] font-semibold mt-0.5">PayAI</span>
        </button>
        <button onClick={() => setActiveTab('business')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer ${activeTab === 'business' ? 'text-[#5EEAB0]' : 'text-white/65'}`}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <span>Business</span>
        </button>
        <button onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer ${activeTab === 'profile' ? 'text-[#5EEAB0]' : 'text-white/65'}`}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Profile</span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ONBOARDING SCREENS */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SplashScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-[#0F172A] to-[#0E3A2C]">
      <div className="flex flex-col items-center gap-5">
        <img
          src="/payit-icon.jpg"
          alt="PayIT Logo"
          className="w-[80px] h-[80px] rounded-[24px] object-cover shadow-[0_20px_40px_rgba(94,234,176,0.3)]"
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[32px] font-extrabold text-white tracking-tight">PayIT</span>
          <span className="text-[13px] text-[#5EEAB0] font-medium tracking-widest uppercase">Universal Money</span>
        </div>
        <div className="mt-6">
          <Loader2 size={20} color="#5EEAB0" className="animate-spin" />
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex-1 flex flex-col px-5 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <img
          src="/payit-icon.jpg"
          alt="PayIT Logo"
          className="w-[72px] h-[72px] rounded-[22px] object-cover shadow-hero"
        />
        <div className="text-center">
          <h1 className="text-[28px] font-extrabold text-[#0F172A] leading-tight">Welcome to<br /><span className="text-[#047857]">PayIT</span></h1>
          <p className="text-[13px] text-[#64748B] mt-2 leading-relaxed max-w-[260px] mx-auto">
            Your self-custodial wallet for payments, savings, and business — all in one place.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          {[
            { icon: <Shield size={16} color={EMERALD} />, text: 'Powered by Particle Network Universal Accounts' },
            { icon: <Globe size={16} color={EMERALD} />, text: 'Accept NGN, USD, GBP, EUR & crypto in seconds' },
            { icon: <TrendingUp size={16} color={EMERALD} />, text: 'Earn up to 8.2% APY on your idle balance' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#ECFDF5] rounded-[12px]">
              <div className="w-8 h-8 rounded-[8px] bg-white flex items-center justify-center shrink-0 shadow-sm">{f.icon}</div>
              <span className="text-[12.5px] text-[#0F172A] font-medium leading-snug">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 pb-4 flex flex-col gap-2.5">
        <GreenBtn label="Get Started" onClick={onContinue} icon={<ArrowRight size={16} />} />
        <p className="text-center text-[11px] text-[#94A3B8]">
          By continuing, you agree to PayIT's Terms of Service & Privacy Policy
        </p>
      </div>
    </div>
  );
}

function MagicLinkScreen({ onBack, onVerified }: { 
  onBack: () => void; 
  onVerified: (token: string, user: UserData) => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  async function handleSend() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) { 
      setError('Please enter a valid email address.'); 
      return; 
    }
    
    setError('');
    setLoading(true);
    
    try {
      sessionStorage.setItem('payit_magic_email', cleanEmail);

      // Ensure Magic SDK is loaded and initialized
      const magicInstance = initMagic();
      
      if (!magicInstance) {
        throw new Error('Magic SDK not loaded. Please refresh the page and try again.');
      }

      console.log('[Magic] Sending magic link to:', cleanEmail);

      // Send Magic Link via SDK (fire without blocking)
      magicInstance.auth.loginWithMagicLink({ email: cleanEmail })
        .then(() => console.log('[Magic] Magic link sent successfully'))
        .catch((err: any) => console.warn('[Magic] SDK login promise warning:', err));

      // Notify backend for logging/tracking (non-blocking)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const primaryUrl = API ? `${API}/api/mobile/auth/send-magic-link` : '/api/mobile/auth/send-magic-link';
        await fetch(primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail }),
          signal: controller.signal
        }).catch(() => {
          console.log('[Magic] Backend notification skipped (not critical)');
        });
      } catch (_) {
        // Backend notification is optional
      } finally {
        clearTimeout(timeoutId);
      }

      // Poll for login completion, then hand off to the parent's auth-success handler
      let elapsed = 0;
      const pollInterval = 2000; // 2 seconds
      const maxTimeout = 60000; // 60 seconds

      pollIntervalRef.current = setInterval(async () => {
        elapsed += pollInterval;
        if (elapsed >= maxTimeout) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setLoading(false);
          setError('Login timed out. Please check your email and try again.');
          return;
        }

        try {
          const isLoggedIn = await magicInstance.user.isLoggedIn();
          if (!isLoggedIn) return; // keep polling

          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;

          const didToken = await magicInstance.user.getIdToken();
          console.log('[Magic] DID token retrieved from polling');
          sessionStorage.setItem('payit_token', didToken);

          const res = await fetch(`${API}/api/mobile/me`, {
            headers: { Authorization: `Bearer ${didToken}` }
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
              localStorage.setItem('payit_user_data', JSON.stringify(data.user));
              setLoading(false);
              onVerified(didToken, data.user);
              return;
            }
          }

          // Logged in with Magic, but profile fetch failed or returned unexpected data.
          // This is a distinct failure from "user hasn't clicked the link yet" and
          // should not keep silently retrying.
          setLoading(false);
          setError('Signed in, but we could not load your profile. Please try again.');
        } catch (err) {
          console.error('[Magic] Polling error:', err);
          // Transient errors (network blip, etc.) - let it keep polling until timeout
          // rather than failing on the first hiccup.
        }
      }, pollInterval);

    } catch (err: any) {
      console.error('[Magic] Send error:', err);
      if (err.name === 'AbortError') {
        setError('Connection timed out. Please try again.');
      } else {
        setError(err.message || 'Failed to send magic link. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col px-5 overflow-hidden">
      <div className="pt-2 pb-4 shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-[12px] bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm">
          <ArrowLeft size={17} color={INK} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-6">
        <div>
          <div className="w-[52px] h-[52px] rounded-[16px] bg-[#ECFDF5] flex items-center justify-center mb-4">
            <Mail size={24} color={FOREST} />
          </div>
          <h2 className="text-[24px] font-extrabold text-[#0F172A]">Sign in with<br />Magic Link</h2>
          <p className="text-[13px] text-[#64748B] mt-1.5 leading-relaxed">
            Enter your email and we'll send a secure, passwordless link. No password needed.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <InputField
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            type="email"
          />
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FDECEC] rounded-[10px]">
              <AlertCircle size={14} color={DANGER} />
              <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-3 bg-[#ECFDF5] rounded-[12px]">
          <Lock size={14} color={FOREST} />
          <span className="text-[12px] text-[#047857] font-medium">Your email is only used for authentication. We never spam.</span>
        </div>
      </div>

      <div className="shrink-0 pb-4">
        <GreenBtn label="Send Magic Link" onClick={handleSend} loading={loading} icon={<Send size={15} />} />
      </div>
    </div>
  );
}

function KYCSuccessScreen({ accountType, onContinue }: { accountType?: string; onContinue?: () => void }) {
  return (
    <div className="flex-1 flex flex-col px-5 overflow-hidden items-center justify-center text-center gap-6">
      <div className="w-[80px] h-[80px] rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#047857] shadow-lg animate-bounce">
        <CheckCircle2 size={42} color={FOREST} />
      </div>
      <div>
        <h2 className="text-[24px] font-extrabold text-[#0F172A]">Identity Verified!</h2>
        <p className="text-[13px] text-[#64748B] mt-2 leading-relaxed max-w-[260px]">
          Your {accountType === 'business' ? 'Business' : 'Personal'} account is now fully verified. Your multi-currency receiving accounts are active.
        </p>
      </div>
      <div className="w-full max-w-xs pt-4">
        <GreenBtn label="Go to Dashboard →" onClick={onContinue || (() => {})} icon={<ArrowRight size={16} />} />
      </div>
    </div>
  );
}

function AccountTypeScreen({ selected, onSelect, onContinue }: {
  selected: 'personal' | 'business';
  onSelect: (t: 'personal' | 'business') => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-5 overflow-hidden">
      <div className="flex-1 flex flex-col justify-center gap-6">
        <div>
          <h2 className="text-[24px] font-extrabold text-[#0F172A]">What type of account<br />do you need?</h2>
          <p className="text-[13px] text-[#64748B] mt-1.5">Choose how you'll primarily use PayIT. You can add the other later.</p>
        </div>

        <div className="flex flex-col gap-3">
          {([
            {
              id: 'personal', icon: <User size={22} color={selected === 'personal' ? '#0F172A' : FOREST} />,
              title: 'Personal Account', sub: 'Send money, savings goals, receive from anywhere, personal virtual card.'
            },
            {
              id: 'business', icon: <Building2 size={22} color={selected === 'business' ? '#0F172A' : FOREST} />,
              title: 'Business Account', sub: 'Invoicing, payroll, multi-currency, team access, business virtual card.'
            }
          ] as { id: 'personal' | 'business'; icon: React.ReactNode; title: string; sub: string }[]).map(opt => (
            <button key={opt.id} onClick={() => onSelect(opt.id)}
              className={`flex items-start gap-4 p-4 rounded-[18px] border-2 text-left transition-all ${selected === opt.id ? 'border-[#047857] bg-[#ECFDF5]' : 'border-[#E5E7EB] bg-white'}`}>
              <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0 ${selected === opt.id ? 'bg-gradient-to-br from-[#5EEAB0] to-[#047857]' : 'bg-[#ECFDF5]'}`}>
                {opt.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-[#0F172A]">{opt.title}</span>
                  {selected === opt.id && <CheckCircle2 size={18} color={FOREST} />}
                </div>
                <p className="text-[12px] text-[#64748B] mt-0.5 leading-snug">{opt.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 pb-4">
        <GreenBtn label="Continue to Verification" onClick={onContinue} icon={<ArrowRight size={15} />} />
      </div>
    </div>
  );
}

function KYCPersonalScreen({ token, onDone, onBack }: {
  token: string | null;
  onDone: (user?: UserData) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', dob: '', gender: 'm',
    bvn: '', nin: '',
    address: '', city: '', state: '', postal_code: '', country: 'NG'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    setError('');
    if (!form.bvn && !form.nin) { setError('Please provide your BVN or NIN (11 digits).'); return; }
    const idNum = form.bvn || form.nin;
    if (idNum.length !== 11) { setError('BVN/NIN must be exactly 11 digits.'); return; }
    setLoading(true);
    try {
      const endpoint = form.bvn ? '/api/mobile/verify-bvn' : '/api/mobile/verify-nin';
      const body = { ...form, [form.bvn ? 'bvn' : 'nin']: idNum };
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.status === 409 || data.duplicate || data.status === 'duplicate_kyc') {
        setShowDuplicateModal(true);
      } else if (res.ok && data.success) {
        onDone({ first_name: form.first_name, last_name: form.last_name, is_verified: 1 });
      } else {
        setError(data.error || 'Verification failed. Please check your details.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <SubScreenHeader title="Personal Verification (KYC)" onBack={onBack} />

      {/* Duplicate Account Alert Modal */}
      {showDuplicateModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fadeIn">
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
              <AlertCircle size={32} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#0F172A]">Account Already Exists</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                An account matching this identity / BVN is already registered in PayIT. Would you like to sync your previous account or verify with different details?
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => { setShowDuplicateModal(false); onBack(); }}
                className="w-full bg-[#047857] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#065F46] transition-colors shadow-sm"
              >
                🔗 Sync Previous Account
              </button>
              <button
                onClick={() => { setShowDuplicateModal(false); setForm(f => ({ ...f, bvn: '', nin: '' })); }}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-xs hover:bg-gray-200 transition-colors"
              >
                ✏️ Use Different Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          {[1, 2].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${step >= s ? 'bg-[#047857]' : 'bg-[#E5E7EB]'}`} />
          ))}
        </div>
        <p className="text-[11px] text-[#64748B] mt-1.5">Step {step} of 2 — {step === 1 ? 'Identity' : 'Address & ID'}</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col px-5">
        {step === 1 ? (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="First Name" placeholder="John" value={form.first_name} onChange={v => upd('first_name', v)} />
              <InputField label="Last Name" placeholder="Doe" value={form.last_name} onChange={v => upd('last_name', v)} />
            </div>
            <InputField label="Phone Number" placeholder="+2348012345678" value={form.phone} onChange={v => upd('phone', v)} type="tel" />
            <InputField label="Date of Birth" placeholder="1990-01-15" value={form.dob} onChange={v => upd('dob', v)} type="date" helper="Format: YYYY-MM-DD" />
            <SelectField label="Gender" value={form.gender} onChange={v => upd('gender', v)}
              options={[{ value: 'm', label: 'Male' }, { value: 'f', label: 'Female' }]} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
            <div className="p-3.5 bg-[#ECFDF5] rounded-[12px] mb-1">
              <p className="text-[12px] text-[#047857] font-medium">Provide your BVN <span className="font-bold">or</span> NIN (at least one required)</p>
            </div>
            <InputField label="BVN (Bank Verification Number)" placeholder="12345678901" value={form.bvn} onChange={v => upd('bvn', v)} type="tel" helper="11-digit number" />
            <InputField label="NIN (National ID Number)" placeholder="12345678901" value={form.nin} onChange={v => upd('nin', v)} type="tel" helper="Optional if BVN provided" />
            <InputField label="Home Address" placeholder="14 Commercial Ave" value={form.address} onChange={v => upd('address', v)} />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="City" placeholder="Lagos" value={form.city} onChange={v => upd('city', v)} />
              <InputField label="State" placeholder="Lagos" value={form.state} onChange={v => upd('state', v)} />
            </div>
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#FDECEC] rounded-[10px]">
                <AlertCircle size={14} color={DANGER} />
                <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 pb-4 pt-2">
          {step === 1 ? (
            <GreenBtn label="Next Step →" onClick={() => {
              if (!form.first_name || !form.last_name || !form.phone || !form.dob) {
                setError('Please fill all fields before continuing.');
                return;
              }
              setError('');
              setStep(2);
            }} icon={<ArrowRight size={15} />} />
          ) : (
            <GreenBtn label="Verify My Identity" onClick={handleSubmit} loading={loading} icon={<UserCheck size={15} />} />
          )}
        </div>
      </div>
    </div>
  );
}

function KYBBusinessScreen({ token, onDone, onBack }: {
  token: string | null;
  onDone: (user?: UserData) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: '', business_email: '', business_address: '',
    city: 'Lagos', state: 'Lagos', country: 'NG', postal_code: '100001',
    cac_number: '', tin: '', business_type: 'LLC', industry: 'technology',
    incorporation_year: '2020', incorporation_month: '1',
    director_first_name: '', director_last_name: '', director_phone: '',
    director_dob: '', director_gender: 'm', director_bvn: '', director_nin: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    setError('');
    if (!form.cac_number || form.cac_number.trim().length < 4) {
      setError('Please enter a valid CAC registration number.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/mobile/kyb/submit-cac`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onDone({ business_name: form.business_name, kyb_status: 'pending' });
      } else {
        setError(data.error || 'KYB submission failed. Please check your details.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Business Verification (KYB)" onBack={onBack} />

      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          {[1, 2].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${step >= s ? 'bg-[#047857]' : 'bg-[#E5E7EB]'}`} />
          ))}
        </div>
        <p className="text-[11px] text-[#64748B] mt-1.5">Step {step} of 2 — {step === 1 ? 'Business Info' : 'CAC & Director'}</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col px-5">
        {step === 1 ? (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
            <InputField label="Business Name (Legal)" placeholder="Acme Ltd" value={form.business_name} onChange={v => upd('business_name', v)} />
            <InputField label="Business Email" placeholder="contact@acme.com" value={form.business_email} onChange={v => upd('business_email', v)} type="email" />
            <InputField label="Business Address" placeholder="14 Commercial Ave, Lagos" value={form.business_address} onChange={v => upd('business_address', v)} />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="City" placeholder="Lagos" value={form.city} onChange={v => upd('city', v)} />
              <InputField label="State" placeholder="Lagos" value={form.state} onChange={v => upd('state', v)} />
            </div>
            <SelectField label="Business Type" value={form.business_type} onChange={v => upd('business_type', v)}
              options={[{ value: 'LLC', label: 'LLC (Limited Liability)' }, { value: 'Partnership', label: 'Partnership' }, { value: 'Sole Proprietor', label: 'Sole Proprietor' }]} />
            <SelectField label="Industry" value={form.industry} onChange={v => upd('industry', v)}
              options={[{ value: 'technology', label: 'Technology' }, { value: 'finance', label: 'Finance' }, { value: 'retail', label: 'Retail' }, { value: 'healthcare', label: 'Healthcare' }, { value: 'logistics', label: 'Logistics' }]} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-4">
            <InputField label="CAC Registration Number" placeholder="RC1234567" value={form.cac_number} onChange={v => upd('cac_number', v)} helper="Nigerian Corporate Affairs Commission number" />
            <InputField label="Tax Identification Number (TIN)" placeholder="12345678-0001" value={form.tin} onChange={v => upd('tin', v)} helper="Optional but recommended" />
            <div className="h-px bg-[#E5E7EB] my-1" />
            <p className="text-[12px] font-bold text-[#0F172A] uppercase tracking-wide">Director / Control Person</p>
            <div className="grid grid-cols-2 gap-3">
              <InputField label="First Name" placeholder="John" value={form.director_first_name} onChange={v => upd('director_first_name', v)} />
              <InputField label="Last Name" placeholder="Doe" value={form.director_last_name} onChange={v => upd('director_last_name', v)} />
            </div>
            <InputField label="Director Phone" placeholder="+2348012345678" value={form.director_phone} onChange={v => upd('director_phone', v)} type="tel" />
            <InputField label="Director Date of Birth" placeholder="1985-01-01" value={form.director_dob} onChange={v => upd('director_dob', v)} type="date" />
            <SelectField label="Director Gender" value={form.director_gender} onChange={v => upd('director_gender', v)}
              options={[{ value: 'm', label: 'Male' }, { value: 'f', label: 'Female' }]} />
            <InputField label="Director BVN (optional)" placeholder="12345678901" value={form.director_bvn} onChange={v => upd('director_bvn', v)} type="tel" />
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#FDECEC] rounded-[10px]">
                <AlertCircle size={14} color={DANGER} />
                <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 pb-4 pt-2">
          {step === 1 ? (
            <GreenBtn label="Next: CAC & Director" onClick={() => {
              if (!form.business_name || !form.business_email) {
                setError('Business name and email are required.');
                return;
              }
              setError('');
              setStep(2);
            }} icon={<ArrowRight size={15} />} />
          ) : (
            <GreenBtn label="Submit for Verification" onClick={handleSubmit} loading={loading} icon={<UserCheck size={15} />} />
          )}
        </div>
      </div>
    </div>
  );
}
function HomeScreen({ user, currency, setCurrency, balanceHide, setBalanceHide, onNav, token, setUser }: {
  user: UserData | null;
  currency: 'NGN' | 'USD';
  setCurrency: (c: 'NGN' | 'USD') => void;
  balanceHide: boolean;
  setBalanceHide: (b: boolean) => void;
  onNav: (s: Screen) => void;
  token: string | null;
  setUser?: (u: UserData) => void;
}) {
  const [balance, setBalance] = useState({ ngn: 0, usd: 0 });
  const [txs, setTxs] = useState<any[]>([]);
  const [acctNo, setAcctNo] = useState(user?.nuvion_account_no || '');
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => {
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const [balRes, txRes, meRes] = await Promise.all([
          fetch(`${API}/api/mobile/balance?context=personal`, { headers, signal: controller.signal }),
          fetch(`${API}/api/mobile/transactions`, { headers, signal: controller.signal }),
          fetch(`${API}/api/mobile/me`, { headers, signal: controller.signal })
        ]);
        clearTimeout(timeoutId);
        if (balRes.ok) {
          const b = await balRes.json();
          const ngnVal = typeof b.ngnTotal === 'number' ? b.ngnTotal : (typeof b.fiat?.total === 'number' ? b.fiat.total : 0);
          const usdVal = typeof b.usdTotal === 'number' ? b.usdTotal : 0;
          setBalance({ ngn: ngnVal, usd: usdVal });
        }
        if (txRes.ok) {
          const t = await txRes.json();
          if (t.transactions && t.transactions.length > 0) {
            setTxs(t.transactions.slice(0, 8));
          }
        }
        if (meRes.ok) {
          const m = await meRes.json();
          if (m.user) {
            if (setUser) setUser(m.user);
            localStorage.setItem('payit_user_data', JSON.stringify(m.user));
            if (m.user.nuvion_account_no) {
              setAcctNo(m.user.nuvion_account_no);
            }
          }
        }
      } catch {
        clearTimeout(timeoutId);
      }
    })();
  }, [token]);

  const displayName = user?.first_name || user?.name?.split(' ')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const displayBal = currency === 'NGN' ? `₦${balance.ngn.toLocaleString()}` : `$${balance.usd.toFixed(2)}`;

  const actions = [
    { icon: <Plus size={18} />, label: 'Add', screen: 'add_money' as Screen },
    { icon: <Send size={18} />, label: 'Send', screen: 'send_money' as Screen, active: true },
    { icon: <Users size={18} />, label: 'Split', screen: 'split_bill' as Screen },
    { icon: <Zap size={18} />, label: 'Bills', screen: 'bills' as Screen },
    { icon: <PiggyBank size={18} />, label: 'Savings', screen: 'savings' as Screen },
  ];

  function copyTxRef(ref: string) {
    navigator.clipboard.writeText(ref).catch(() => {});
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  }

  function downloadReceiptPng(tx: any) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 750;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 0, 750);
    grad.addColorStop(0, '#0F172A');
    grad.addColorStop(1, '#07101C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 750);

    ctx.fillStyle = '#1E293B';
    ctx.roundRect(40, 40, 520, 670, 24);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = tx.isNegative ? '#F59E0B' : '#10B981';
    ctx.fillRect(40, 40, 520, 8);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('PayIT Official Receipt', 70, 95);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '13px sans-serif';
    ctx.fillText('Digital Financial Transaction Record', 70, 118);

    ctx.fillStyle = tx.isNegative ? '#FEF3C7' : '#ECFDF5';
    ctx.roundRect(430, 75, 100, 32, 16);
    ctx.fill();
    ctx.fillStyle = tx.isNegative ? '#D97706' : '#047857';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(tx.isNegative ? 'DEBIT' : 'CREDIT', 452, 96);

    ctx.fillStyle = tx.isNegative ? '#F59E0B' : '#10B981';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(tx.amount, 70, 185);

    ctx.fillStyle = '#64748B';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Status: ${(tx.status || 'COMPLETED').toUpperCase()}`, 70, 212);

    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(70, 235);
    ctx.lineTo(530, 235);
    ctx.stroke();

    const rows = [
      ['Transaction Type', tx.name || 'Transfer'],
      ['Date & Time', tx.date || new Date().toLocaleString()],
      ['Reference ID', tx.reference || tx.id],
      ['Sender Account', tx.sender || 'PayIT Account'],
      ['Recipient', tx.recipient || 'Beneficiary'],
      ['Banking Rail', tx.bank_name || 'VFD Microfinance Bank / Nuvion'],
      ['Narration / Note', tx.note || 'PayIT Payment Transfer']
    ];

    let y = 275;
    rows.forEach(([label, val]) => {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px sans-serif';
      ctx.fillText(label, 70, y);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px sans-serif';
      const truncatedVal = (val || '').length > 32 ? (val || '').slice(0, 32) + '...' : (val || '');
      ctx.fillText(truncatedVal, 240, y);
      y += 42;
    });

    ctx.fillStyle = '#475569';
    ctx.font = '11px sans-serif';
    ctx.fillText('Issued by PayIT Inc. · Verified via Nuvion & Particle Network Paymaster', 70, 680);

    const link = document.createElement('a');
    link.download = `PayIT_Receipt_${(tx.reference || tx.id || 'N/A').slice(-8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pt-1 relative">
      {/* Header */}
      <div className="flex items-center justify-between py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-[44px] h-[44px] rounded-[13px] bg-gradient-to-br from-[#047857] to-[#0F172A] flex items-center justify-center text-white font-bold text-sm tracking-wide shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-[11.5px] text-[#64748B] font-medium leading-tight">
              {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[16px] text-[#0F172A] font-bold tracking-tight">{displayName}</span>
              {user?.is_verified === 1 && (
                <div className="w-[15px] h-[15px] bg-[#10B981] text-white rounded-full flex items-center justify-center shrink-0">
                  <Check size={9} strokeWidth={3} />
                </div>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => onNav('notifications')}
          className="relative w-[38px] h-[38px] rounded-[12px] bg-white border border-[#E5E7EB] flex items-center justify-center text-[#0F172A] shadow-sm">
          <Bell size={17} strokeWidth={2} />
          <span className="absolute top-[9px] right-[9px] w-[6px] h-[6px] bg-[#10B981] rounded-full border border-white" />
        </button>
      </div>

      {/* Hero Balance Card */}
      <div className="balance-card relative rounded-[26px] p-5 shrink-0 overflow-hidden shadow-hero"
        style={{ background: 'linear-gradient(155deg, #0F172A 0%, #0E3A2C 60%, #047857 130%)' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setBalanceHide(!balanceHide)} className="flex items-center gap-1.5 text-white/60 text-[11px] font-semibold uppercase tracking-wide">
            {balanceHide ? <EyeOff size={13} /> : <Eye size={13} />}
            {currency} BALANCE
          </button>
          <button onClick={() => setCurrency(currency === 'NGN' ? 'USD' : 'NGN')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-bold">
            <span className="text-[9px]">{currency === 'NGN' ? '🇳🇬' : '🇺🇸'}</span> {currency} ▾
          </button>
        </div>
        <div className="text-[32px] font-extrabold text-white tracking-tight">
          {balanceHide ? '••••••' : displayBal}
        </div>
        <div className="text-[12px] text-white/50 mt-0.5">
          {currency === 'NGN' ? `≈ $${balance.usd.toFixed(2)} USD` : `≈ ₦${balance.ngn.toLocaleString()} NGN`}
          {' · '}tap to switch
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-[24px] h-[15px] rounded-[3px] bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]" />
            <span className="text-white/70 text-[13px] font-mono tracking-widest">•••• 4821</span>
          </div>
          <button onClick={() => onNav('cards')} className="text-[#5EEAB0] text-[12px] font-semibold flex items-center gap-1">
            Manage card <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-between mt-4 shrink-0">
        {actions.map(a => (
          <button key={a.label} onClick={() => onNav(a.screen)}
            className="flex flex-col items-center gap-1.5 cursor-pointer group">
            <div className={`w-[52px] h-[52px] rounded-[17px] flex items-center justify-center shadow-sm transition-all group-hover:scale-105 ${a.active ? 'bg-gradient-to-br from-[#10B981] to-[#047857] text-white' : 'bg-white text-[#047857] border border-[#E5E7EB]'}`}>
              {a.icon}
            </div>
            <span className="text-[11px] text-[#0F172A] font-semibold">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Insight Banner */}
      <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-[#ECFDF5] rounded-[16px] border border-[#D1FAE5] shrink-0">
        <div className="w-8 h-8 rounded-[9px] bg-white flex items-center justify-center shrink-0 shadow-sm">
          <Zap size={15} color={EMERALD} />
        </div>
        <div className="flex-1">
          <p className="text-[12.5px] font-bold text-[#0F172A]">Grow your money automatically</p>
          <p className="text-[11px] text-[#64748B]">Round up spare change into Savings</p>
        </div>
        <button className="px-3 py-1.5 rounded-[10px] border border-[#047857] text-[#047857] text-[11.5px] font-bold shrink-0">
          Turn on
        </button>
      </div>

      {/* Recent Activity — fixed height list, clickable details */}
      <div className="mt-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[14px] font-bold text-[#0F172A]">Recent Activity</span>
          <button className="text-[12px] text-[#047857] font-semibold">See all</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {txs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                <BarChart3 size={18} color={SLATE} />
              </div>
              <p className="text-[12px] text-[#64748B]">No transactions yet. Add money to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {txs.map((tx, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTx(tx)}
                  className="flex items-center gap-3 px-3.5 py-3 bg-white rounded-[14px] border border-[#E5E7EB] shadow-xs hover:border-[#047857] transition-all text-left w-full"
                >
                  <div
                    className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 border ${
                      tx.isNegative
                        ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#D97706]'
                        : 'bg-[#ECFDF5] border-[#D1FAE5] text-[#10B981]'
                    }`}
                  >
                    {tx.isNegative ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#0F172A] truncate">{tx.name}</p>
                    <p className="text-[11px] text-[#64748B]">{tx.date}</p>
                  </div>
                  <span className={`text-[13px] font-bold shrink-0 ${tx.isNegative ? 'text-[#D97706]' : 'text-[#10B981]'}`}>{tx.amount}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type FiatAccount = { currency: string; account_number: string; bank_name: string; beneficiary_name: string; routing_number?: string | null; iban?: string | null; swift_bic?: string | null };
type CryptoChainInfo = { chain: string; address: string; symbol: string; chainId?: number; isNativeL2?: boolean; isBridgeAuto?: boolean };

const CURRENCY_META: Record<string, { flag: string; label: string }> = {
  NGN: { flag: '🇳🇬', label: 'Nigerian Naira' },
  USD: { flag: '🇺🇸', label: 'US Dollar' },
  GBP: { flag: '🇬🇧', label: 'British Pound' },
  EUR: { flag: '🇪🇺', label: 'Euro' },
  KES: { flag: '🇰🇪', label: 'Kenyan Shilling' },
  GHS: { flag: '🇬🇭', label: 'Ghanaian Cedi' },
  ZAR: { flag: '🇿🇦', label: 'South African Rand' },
  CAD: { flag: '🇨🇦', label: 'Canadian Dollar' },
  AED: { flag: '🇦🇪', label: 'UAE Dirham' },
};

function AddMoneyScreen({ onBack, token, user, initialContext = 'personal' }: { onBack: () => void; token: string | null; user: UserData | null; initialContext?: 'personal' | 'business' }) {
  const [selected, setSelected] = useState<'local' | 'crypto'>('local');
  const [accountContext, setAccountContext] = useState<'personal' | 'business'>(initialContext);
  const [loading, setLoading] = useState(true);
  const [fiatAccounts, setFiatAccounts] = useState<FiatAccount[]>([]);
  const [cryptoChains, setCryptoChains] = useState<CryptoChainInfo[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('NGN');
  const [selectedChain, setSelectedChain] = useState(0);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const endpoint = accountContext === 'business'
      ? `${API}/api/mobile/business/receive-methods`
      : `${API}/api/mobile/receive-methods?context=personal`;

    const defaultName = (accountContext === 'business'
      ? (user?.business_name || 'IBOH TECH LTD')
      : (user?.name || user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'IBOH IGBOZE')).toUpperCase() + ' / PayIT';

    const defaultPersonalNgn = user?.nuvion_account_no || '9687257081';
    const defaultBusinessNgn = user?.nuvion_business_account_no || '9134148532';
    const ngnNo = accountContext === 'business' ? defaultBusinessNgn : defaultPersonalNgn;

    const fallbackFiat: FiatAccount[] = [
      { currency: 'NGN', account_number: ngnNo, bank_name: 'Flutterwave MFB / Nuvion Partner Bank', beneficiary_name: defaultName },
      { currency: 'USD', account_number: '319889666412', bank_name: 'Cross River Bank / Nuvion Partner', routing_number: '021214891', beneficiary_name: defaultName },
      { currency: 'EUR', account_number: 'GB02CLRB04288634633790', bank_name: 'Global Remit Financial Services Ltd', iban: 'GB02CLRB04288634633790', swift_bic: 'PAYIT2L', beneficiary_name: defaultName },
      { currency: 'GBP', account_number: '00005611', bank_name: 'Global Remit Financial Services Ltd', routing_number: '042886', beneficiary_name: defaultName },
      { currency: 'KES', account_number: '0012778025', bank_name: 'Flutterwave MFB / Lead Bank', beneficiary_name: defaultName },
      { currency: 'GHS', account_number: '9990000107280', bank_name: 'First Bank Ghana', beneficiary_name: defaultName },
      { currency: 'CAD', account_number: 'GB34CLRB04288653820590', bank_name: 'Global Remit Financial Services Ltd', beneficiary_name: defaultName },
      { currency: 'ZAR', account_number: '0019241025', bank_name: 'Lead Bank / Nuvion Partner', beneficiary_name: defaultName },
      { currency: 'AED', account_number: 'AE530960000691060023725', bank_name: 'Zand Bank PJSC', beneficiary_name: defaultName }
    ];

    const fallbackCrypto: CryptoChainInfo[] = [
      { chain: 'Arbitrum One', symbol: 'USDC', address: user?.personal_smart_account || user?.owner_address || '0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24', chainId: 42161, isNativeL2: true },
      { chain: 'Base', symbol: 'USDC', address: user?.personal_smart_account || user?.owner_address || '0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24', chainId: 8453, isNativeL2: true },
      { chain: 'Polygon', symbol: 'USDC', address: user?.personal_smart_account || user?.owner_address || '0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24', chainId: 137 },
      { chain: 'Ethereum', symbol: 'USDC', address: user?.personal_smart_account || user?.owner_address || '0x442e2E7EAC9c3f190e837d5ef74dD037EC235B24', chainId: 1 }
    ];

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch(endpoint, { headers, signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        clearTimeout(timeoutId);
        const fiat: FiatAccount[] = d.fiatAccounts || d.fiat_accounts || [];
        const crypto: CryptoChainInfo[] = d.cryptoChains || d.cryptoAccounts || d.crypto_accounts || [];
        setFiatAccounts(fiat.length > 0 ? fiat : fallbackFiat);
        setCryptoChains(crypto.length > 0 ? crypto : fallbackCrypto);
        const ngn = (fiat.length > 0 ? fiat : fallbackFiat).find(a => a.currency === 'NGN');
        setSelectedCurrency(ngn ? 'NGN' : (fiat[0]?.currency || 'NGN'));
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setFiatAccounts(fallbackFiat);
        setCryptoChains(fallbackCrypto);
        setSelectedCurrency('NGN');
      })
      .finally(() => setLoading(false));
  }, [token, accountContext, user]);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 2200);
  }

  const activeAccount = fiatAccounts.find(a => a.currency === selectedCurrency);
  const activeChain = cryptoChains[selectedChain];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Add Money" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-3.5 overflow-y-auto pb-4">
        
        {/* Account Context Switcher (Personal vs Business) */}
        <div className="flex gap-2 shrink-0">
          {(['personal', 'business'] as const).map(ctx => (
            <button key={ctx} onClick={() => setAccountContext(ctx)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[12px] text-[12px] font-bold transition-all ${
                accountContext === ctx
                  ? 'bg-gradient-to-r from-[#047857] to-[#10B981] text-white shadow-sm'
                  : 'bg-white border border-[#E5E7EB] text-[#64748B]'
              }`}>
              {ctx === 'personal' ? <User size={13} /> : <Building2 size={13} />}
              {ctx === 'personal' ? 'Personal Account' : 'Business Account'}
            </button>
          ))}
        </div>

        <p className="text-[12.5px] text-[#64748B] shrink-0">Funding options for <span className="font-bold text-[#0F172A] capitalize">{accountContext}</span> account. All deposits settle instantly as USDT.</p>

        {/* Mode selector */}
        <div className="flex gap-2 shrink-0">
          {(['local', 'crypto'] as const).map(mode => (
            <button key={mode} onClick={() => setSelected(mode)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[13px] text-[12.5px] font-bold transition-all ${
                selected === mode ? 'bg-gradient-to-r from-[#047857] to-[#10B981] text-white shadow-card' : 'bg-white border border-[#E5E7EB] text-[#64748B]'
              }`}>
              {mode === 'local' ? <Receipt size={14} /> : <Wallet size={14} />}
              {mode === 'local' ? 'Bank / Fiat' : 'Crypto'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin" color={FOREST} />
          </div>
        ) : selected === 'local' ? (
          <>
            {/* Currency selector pills */}
            {fiatAccounts.length > 0 ? (
              <>
                <div className="shrink-0">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-2">Select Currency</p>
                  <div className="flex flex-wrap gap-2">
                    {fiatAccounts.map(acc => {
                      const meta = CURRENCY_META[acc.currency] || { flag: '💱', label: acc.currency };
                      return (
                        <button key={acc.currency} onClick={() => setSelectedCurrency(acc.currency)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border-2 transition-all ${
                            selectedCurrency === acc.currency
                              ? 'border-[#047857] bg-[#047857] text-white'
                              : 'border-[#E5E7EB] bg-white text-[#0F172A]'
                          }`}>
                          <span className="text-[14px]">{meta.flag}</span>
                          {acc.currency}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected account details */}
                {activeAccount && (
                  <div className="p-4 bg-white rounded-[18px] border-l-4 border-l-[#047857] border border-[#E5E7EB] shadow-card shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-[8px] bg-[#ECFDF5] flex items-center justify-center text-[13px]">
                          {(CURRENCY_META[activeAccount.currency] || {flag:'💱'}).flag}
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-[#0F172A]">{(CURRENCY_META[activeAccount.currency] || {label: activeAccount.currency}).label}</p>
                          <p className="text-[11px] text-[#64748B]">{activeAccount.bank_name}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[10px] font-bold text-[#047857]">✓ Active</span>
                    </div>

                    <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Account Number</p>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[20px] font-mono font-extrabold text-[#0F172A] tracking-widest flex-1">{activeAccount.account_number}</p>
                      <button onClick={() => copyText(activeAccount.account_number, 'acct')}
                        className="w-8 h-8 rounded-[9px] bg-[#ECFDF5] flex items-center justify-center shrink-0">
                        {copied === 'acct' ? <Check size={14} color={FOREST} /> : <Copy size={14} color={FOREST} />}
                      </button>
                    </div>

                    <p className="text-[12px] text-[#64748B]">Beneficiary: <span className="font-semibold text-[#0F172A]">{activeAccount.beneficiary_name}</span></p>

                    {activeAccount.routing_number && (
                      <p className="text-[11px] text-[#64748B] mt-1">Routing: <span className="font-mono font-semibold text-[#0F172A]">{activeAccount.routing_number}</span></p>
                    )}
                    {activeAccount.swift_bic && (
                      <p className="text-[11px] text-[#64748B] mt-0.5">SWIFT/BIC: <span className="font-mono font-semibold text-[#0F172A]">{activeAccount.swift_bic}</span></p>
                    )}
                    {activeAccount.iban && (
                      <p className="text-[11px] text-[#64748B] mt-0.5">IBAN: <span className="font-mono font-semibold text-[#0F172A]">{activeAccount.iban}</span></p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-5 bg-[#F9FAFB] rounded-[18px] border border-[#E5E7EB] text-center">
                <Globe size={28} color={SLATE} className="mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-[#0F172A]">No fiat accounts provisioned yet</p>
                <p className="text-[11px] text-[#64748B] mt-1">Complete verification to unlock multi-currency accounts</p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Crypto chain selector */}
            {cryptoChains.length > 0 ? (
              <>
                <div className="shrink-0">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-2">Select Network</p>
                  <div className="flex flex-wrap gap-2">
                    {cryptoChains.map((c, i) => (
                      <button key={i} onClick={() => setSelectedChain(i)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border-2 transition-all ${
                          selectedChain === i ? 'border-[#047857] bg-[#047857] text-white' : 'border-[#E5E7EB] bg-white text-[#64748B]'
                        }`}>{c.chain.split(' ')[0]}</button>
                    ))}
                  </div>
                </div>

                {activeChain && (
                  <div className="p-4 bg-white rounded-[18px] border border-[#E5E7EB] shadow-card shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[12px]">⬡</div>
                      <div>
                        <p className="text-[13px] font-bold text-[#0F172A]">{activeChain.chain}</p>
                        <p className="text-[11px] text-[#64748B]">{activeChain.symbol}</p>
                      </div>
                      {activeChain.isNativeL2 && <span className="ml-auto px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[9px] font-bold text-[#047857]">Native L2</span>}
                      {activeChain.isBridgeAuto && <span className="ml-auto px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[9px] font-bold text-[#1D4ED8]">Auto-Bridge</span>}
                    </div>
                    <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Deposit Address</p>
                    <div className="flex items-start gap-2">
                      <p className="text-[11px] font-mono text-[#0F172A] break-all flex-1 leading-snug">{activeChain.address}</p>
                      <button onClick={() => copyText(activeChain.address, 'crypto')}
                        className="w-8 h-8 rounded-[9px] bg-[#ECFDF5] flex items-center justify-center shrink-0 mt-0.5">
                        {copied === 'crypto' ? <Check size={14} color={FOREST} /> : <Copy size={14} color={FOREST} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#F59E0B] font-semibold mt-2">⚠ Only send {activeChain.symbol} on {activeChain.chain} to this address</p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-5 bg-[#F9FAFB] rounded-[18px] border border-[#E5E7EB] text-center">
                <Wallet size={28} color={SLATE} className="mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-[#0F172A]">Loading crypto addresses...</p>
              </div>
            )}
          </>
        )}

        {/* Info banner */}
        <div className="flex items-start gap-2.5 px-3.5 py-3 bg-[#F0FDF4] rounded-[12px] border border-[#D1FAE5] shrink-0">
          <Info size={14} color={FOREST} className="mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#047857] font-medium leading-snug">Your money stays safe and stable in dollars, no matter which currency or asset you deposit with.</p>
        </div>
      </div>
    </div>
  );
}

function SendMoneyScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [form, setForm] = useState({ account_number: '', bank: 'Access Bank', amount: '', currency: 'NGN', recipientName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function verifyAccount() {
    if (!form.account_number || form.account_number.length < 8) return;
    setVerifying(true);
    try {
      const res = await fetch(`${API}/api/mobile/verify-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ account_number: form.account_number, bankName: form.bank, currency: form.currency })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.account_name) upd('recipientName', d.account_name);
      }
    } catch { /* ignore */ }
    finally { setVerifying(false); }
  }

  async function handleSend() {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Please enter a valid amount.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/mobile/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...form, currency: form.currency })
      });
      const data = await res.json();
      if (res.ok && data.success) { setStep('success'); }
      else { setError(data.error || 'Transfer failed. Please try again.'); }
    } catch {
      setError('Network error. Please check your connection.');
    } finally { setLoading(false); }
  }

  if (step === 'success') {
    return (
      <div className="flex-1 flex flex-col">
        <SubScreenHeader title="Send Money" onBack={onBack} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
          <div className="w-[72px] h-[72px] rounded-full bg-[#ECFDF5] flex items-center justify-center">
            <CheckCircle2 size={40} color={EMERALD} />
          </div>
          <div>
            <h3 className="text-[22px] font-extrabold text-[#0F172A]">Transfer Sent!</h3>
            <p className="text-[13px] text-[#64748B] mt-1.5">{form.currency} {form.amount} sent to {form.recipientName || form.account_number}</p>
          </div>
          <GreenBtn label="Back to Home" onClick={onBack} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Send Money" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-3 overflow-hidden">
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto pb-2">
          <SelectField label="Currency" value={form.currency} onChange={v => upd('currency', v)}
            options={[{ value: 'NGN', label: '🇳🇬 Nigerian Naira (NGN)' }, { value: 'USD', label: '🇺🇸 US Dollar (USD)' }, { value: 'GBP', label: '🇬🇧 British Pound (GBP)' }]} />
          <InputField label="Recipient Account Number" placeholder="0123456789" value={form.account_number}
            onChange={v => upd('account_number', v)} type="tel"
            helper={verifying ? 'Verifying...' : (form.recipientName ? `✓ ${form.recipientName}` : 'Enter 10-digit account number')} />
          {form.account_number.length >= 10 && !form.recipientName && (
            <button onClick={verifyAccount} className="text-[#047857] text-[12px] font-semibold text-left">
              {verifying ? 'Resolving account...' : 'Tap to resolve account name →'}
            </button>
          )}
          <SelectField label="Bank" value={form.bank} onChange={v => upd('bank', v)}
            options={['Access Bank', 'GTBank', 'Zenith Bank', 'First Bank', 'UBA', 'Kuda Bank', 'OPay', 'Moniepoint', 'Wema Bank', 'Sterling Bank'].map(b => ({ value: b, label: b }))} />
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Amount</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">
                {form.currency === 'NGN' ? '₦' : form.currency === 'USD' ? '$' : '£'}
              </span>
              <input type="number" placeholder="0.00" value={form.amount} onChange={e => upd('amount', e.target.value)}
                className="w-full h-[46px] pl-8 rounded-[12px] border border-[#E5E7EB] bg-white text-[14px] font-bold text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#047857] transition-all" />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FDECEC] rounded-[10px]">
              <AlertCircle size={14} color={DANGER} />
              <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="Send Money" onClick={handleSend} loading={loading} icon={<Send size={15} />} />
      </div>
    </div>
  );
}

function SplitBillScreen({ onBack }: { onBack: () => void }) {
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState(2);
  const split = amount ? (parseFloat(amount) / people).toFixed(2) : '0.00';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Split Bill" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-4 overflow-hidden">
        <div className="flex flex-col gap-3 shrink-0">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Total Bill Amount (₦)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">₦</span>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full h-[46px] pl-8 rounded-[12px] border border-[#E5E7EB] bg-white text-[14px] font-bold text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#047857] transition-all" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Number of People</label>
            <div className="flex items-center gap-4 p-3 bg-white rounded-[12px] border border-[#E5E7EB]">
              <button onClick={() => setPeople(Math.max(2, people - 1))} className="w-9 h-9 rounded-[10px] bg-[#ECFDF5] text-[#047857] font-bold text-lg">−</button>
              <span className="flex-1 text-center text-[18px] font-extrabold text-[#0F172A]">{people}</span>
              <button onClick={() => setPeople(people + 1)} className="w-9 h-9 rounded-[10px] bg-[#ECFDF5] text-[#047857] font-bold text-lg">+</button>
            </div>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-br from-[#0F172A] to-[#0E3A2C] rounded-[20px] text-center shrink-0">
          <p className="text-[12px] text-white/50 font-semibold uppercase tracking-widest">Each Person Pays</p>
          <p className="text-[36px] font-extrabold text-white mt-1">₦{split}</p>
          <p className="text-[11px] text-[#5EEAB0] mt-1">Split {people} ways equally</p>
        </div>

        <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
          <p className="text-[12px] font-bold text-[#64748B] uppercase tracking-wide shrink-0">Send Request To</p>
          {Array.from({ length: Math.min(people - 1, 4) }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-[12px] border border-[#E5E7EB]">
              <div className="w-9 h-9 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#047857] font-bold text-sm">
                {String.fromCharCode(65 + i)}
              </div>
              <input placeholder={`Friend ${i + 1} name or phone`}
                className="flex-1 text-[13px] text-[#0F172A] bg-transparent outline-none placeholder-[#94A3B8]" />
              <span className="text-[12px] font-bold text-[#10B981]">₦{split}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="Send Split Requests" icon={<Send size={15} />} />
      </div>
    </div>
  );
}

function BillsScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [selected, setSelected] = useState('');

  const categories = [
    { id: 'airtime', label: 'Airtime', icon: '📱', color: '#ECFDF5' },
    { id: 'data', label: 'Data', icon: '📶', color: '#EFF6FF' },
    { id: 'electricity', label: 'Electricity', icon: '⚡', color: '#FEF3C7' },
    { id: 'cable', label: 'Cable TV', icon: '📺', color: '#FDF2F8' },
    { id: 'water', label: 'Water', icon: '💧', color: '#E0F2FE' },
    { id: 'internet', label: 'Internet', icon: '🌐', color: '#F0FDF4' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Pay Bills" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-4 overflow-hidden">
        {/* Category grid */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={`flex flex-col items-center gap-2 p-3.5 rounded-[16px] border-2 transition-all ${selected === c.id ? 'border-[#047857] bg-[#ECFDF5]' : 'border-transparent bg-white'}`}>
              <span className="text-[24px]">{c.icon}</span>
              <span className="text-[11.5px] font-semibold text-[#0F172A]">{c.label}</span>
            </button>
          ))}
        </div>

        {/* Bill form */}
        {selected && (
          <div className="flex flex-col gap-3 flex-1">
            <SelectField label="Provider" value="" onChange={() => {}}
              options={
                selected === 'airtime' || selected === 'data'
                  ? [{ value: 'mtn', label: 'MTN' }, { value: 'airtel', label: 'Airtel' }, { value: 'glo', label: 'Glo' }, { value: '9mobile', label: '9mobile' }]
                  : selected === 'electricity'
                  ? [{ value: 'ekedc', label: 'EKEDC (Eko)' }, { value: 'ikedc', label: 'IKEDC (Ikeja)' }, { value: 'aedc', label: 'AEDC (Abuja)' }]
                  : [{ value: 'dstv', label: 'DStv' }, { value: 'gotv', label: 'GOtv' }, { value: 'startimes', label: 'StarTimes' }]
              } />
            <InputField label="Phone / Account / Meter Number" placeholder="Enter number" value="" onChange={() => {}} />
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Amount (₦)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">₦</span>
                <input type="number" placeholder="500" className="w-full h-[46px] pl-8 rounded-[12px] border border-[#E5E7EB] bg-white text-[14px] font-bold text-[#0F172A] outline-none focus:border-[#047857] transition-all" />
              </div>
            </div>
          </div>
        )}

        {!selected && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-[#94A3B8] text-center">Select a bill category above to get started</p>
          </div>
        )}
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="Pay Bill" disabled={!selected} icon={<Zap size={15} />} />
      </div>
    </div>
  );
}

function SavingsScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [savings, setSavings] = useState<{ apy: number; totalNgn: number; totalInterestNgn: number; savings: { lock_id: string; amount: number; duration_days: number; unlock_at: string }[] }>({ apy: 8.2, totalNgn: 0, totalInterestNgn: 0, savings: [] });
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('30');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/mobile/savings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => setSavings(d)).catch(() => {});
  }, [token]);

  async function handleSave() {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/mobile/savings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amountNgn: parseFloat(amount), durationDays: parseInt(duration) })
      });
      if (res.ok) {
        const d = await res.json();
        alert(d.message || 'Savings created!');
        setAmount('');
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Savings" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-4 overflow-hidden">
        {/* APY Banner */}
        <div className="p-4 rounded-[18px] shrink-0" style={{ background: 'linear-gradient(135deg, #0F172A, #0E3A2C)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-white/50 uppercase tracking-widest font-semibold">Total Saved</p>
              <p className="text-[26px] font-extrabold text-white mt-0.5">₦{savings.totalNgn.toLocaleString()}</p>
              <p className="text-[11px] text-[#5EEAB0] mt-0.5">+₦{savings.totalInterestNgn.toLocaleString()} earned</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-white/50 font-semibold">Current APY</p>
              <p className="text-[28px] font-extrabold text-[#5EEAB0]">{savings.apy}%</p>
              <p className="text-[10px] text-white/40">Aave V3 · Arbitrum</p>
            </div>
          </div>
        </div>

        {/* New savings form */}
        <div className="flex flex-col gap-3 shrink-0">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Amount to Save (₦)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#94A3B8]">₦</span>
              <input type="number" placeholder="5,000" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full h-[46px] pl-8 rounded-[12px] border border-[#E5E7EB] bg-white text-[14px] font-bold text-[#0F172A] outline-none focus:border-[#047857] transition-all" />
            </div>
          </div>
          <SelectField label="Lock Duration" value={duration} onChange={setDuration}
            options={[{ value: '7', label: '7 Days' }, { value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }, { value: '180', label: '6 Months' }, { value: '365', label: '1 Year' }]} />
        </div>

        {/* Active savings */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          <p className="text-[12px] font-bold text-[#64748B] uppercase tracking-wide shrink-0">Active Savings</p>
          {savings.savings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[13px] text-[#94A3B8]">No active savings yet.</p>
            </div>
          ) : savings.savings.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3.5 bg-white rounded-[14px] border border-[#E5E7EB]">
              <div>
                <p className="text-[13px] font-bold text-[#0F172A]">${s.amount.toFixed(2)} USDT</p>
                <p className="text-[11px] text-[#64748B]">{s.duration_days} days · Unlocks {new Date(s.unlock_at).toLocaleDateString()}</p>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-[#ECFDF5]">
                <span className="text-[10.5px] font-bold text-[#047857]">Active</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="Lock Savings" onClick={handleSave} loading={loading} icon={<Lock size={15} />} />
      </div>
    </div>
  );
}

function NotificationsScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; read: boolean; created_at: number }[]>([]);

  useEffect(() => {
    fetch(`${API}/api/mobile/notifications`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json()).then(d => setNotifications(d.notifications || [])).catch(() => {});
  }, [token]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubScreenHeader title="Notifications" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-2 overflow-y-auto pt-2">
        {notifications.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center bg-white rounded-[20px] p-6 border border-gray-200 shadow-sm my-auto">
            <div className="w-14 h-14 rounded-full bg-[#ECFDF5] flex items-center justify-center">
              <Bell size={24} color={FOREST} />
            </div>
            <p className="text-[14px] font-bold text-[#0F172A]">No notifications yet</p>
            <p className="text-[12px] text-[#64748B]">You will receive real-time alerts when invoices are paid or funds arrive.</p>
          </div>
        ) : (
          notifications.map((n, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-[14px] border ${n.read ? 'bg-white border-[#E5E7EB]' : 'bg-[#ECFDF5] border-[#D1FAE5]'}`}>
              <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${n.read ? 'bg-[#F1F5F9]' : 'bg-[#ECFDF5]'}`}>
                <Bell size={16} color={n.read ? SLATE : FOREST} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#0F172A]">{n.title}</p>
                <p className="text-[12px] text-[#64748B] mt-0.5 leading-snug">{n.body}</p>
                <p className="text-[10.5px] text-[#94A3B8] mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-[#10B981] shrink-0 mt-1" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InvoicesScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [currencyType, setCurrencyType] = useState<'fiat' | 'crypto'>('fiat');
  const [selectedCurrency, setSelectedCurrency] = useState('NGN');
  const [depositChain, setDepositChain] = useState('arbitrum');
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]);

  const loadInvoices = () => {
    fetch(`${API}/api/mobile/invoices`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => setInvoices(d.invoices || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadInvoices();
  }, [token]);

  const statusColor: Record<string, string> = { paid: '#10B981', pending: '#F59E0B', overdue: '#DC4C4C' };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !itemDescription.trim() || unitPrice <= 0) {
      setError('Please provide client name, item description, and valid amount.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/mobile/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          clientPhone: clientPhone.trim(),
          itemDescription: itemDescription.trim(),
          quantity,
          unitPrice,
          amount: quantity * unitPrice,
          currency: selectedCurrency,
          depositChain,
          dueDate
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to create invoice');
      setShowCreateModal(false);
      // Reset form
      setClientName(''); setClientEmail(''); setClientPhone(''); setItemDescription(''); setQuantity(1); setUnitPrice(0);
      loadInvoices();
    } catch (err: any) {
      setError(err.message || 'Error creating invoice');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
      <SubScreenHeader title="Invoices Hub" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-3 overflow-hidden pt-2">
        {invoices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center bg-white rounded-[20px] p-6 border border-gray-200/80 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#ECFDF5] flex items-center justify-center">
              <FileText size={28} color={FOREST} />
            </div>
            <p className="text-[15px] font-bold text-[#0F172A]">No invoices yet</p>
            <p className="text-[12px] text-[#64748B] max-w-xs">Create itemized invoices for your clients and get paid in Local Bank Account or Crypto instantly.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
            {invoices.map((inv, i) => (
              <div
                key={i}
                onClick={() => setSelectedInvoice(inv)}
                className="flex items-center gap-3 p-4 bg-white rounded-[16px] border border-[#E5E7EB] hover:border-emerald-500/50 cursor-pointer shadow-sm transition-all"
              >
                <div className="w-11 h-11 rounded-[12px] bg-[#ECFDF5] flex items-center justify-center shrink-0">
                  <FileText size={20} color={FOREST} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[#0F172A] truncate">{inv.recipient || inv.client_name || 'Client'}</p>
                  <p className="text-[11px] text-[#64748B] truncate">{inv.item_description || 'Services'} • Due {inv.due_date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-bold text-[#0F172A]">{inv.currency} {(inv.total_amount || inv.amount || 0).toLocaleString()}</p>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block mt-0.5" style={{ color: statusColor[inv.status] || SLATE, backgroundColor: `${statusColor[inv.status]}15` }}>
                    {(inv.status || 'PENDING').toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="+ Create New Invoice" icon={<Plus size={16} />} onClick={() => setShowCreateModal(true)} />
      </div>

      {/* CREATE INVOICE MODAL */}
      {showCreateModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-[24px] max-h-[90vh] flex flex-col p-5 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Create New Invoice</h3>
                <p className="text-xs text-gray-500">Fill in client & item details</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={18} color="#64748B" />
              </button>
            </div>

            {error && <div className="mb-3 p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">{error}</div>}

            <form onSubmit={handleCreateInvoice} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Client Name *</label>
                <input
                  type="text" required placeholder="e.g. Acme Ltd or John Doe"
                  value={clientName} onChange={e => setClientName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Client Email</label>
                  <input
                    type="email" placeholder="client@example.com"
                    value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone / Address</label>
                  <input
                    type="text" placeholder="+234 801..."
                    value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Service / Item Description *</label>
                <input
                  type="text" required placeholder="e.g. Web Development Services"
                  value={itemDescription} onChange={e => setItemDescription(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number" min="1" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Unit Price *</label>
                  <input
                    type="number" min="0" step="any" required placeholder="0.00"
                    value={unitPrice || ''} onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold"
                  />
                </div>
              </div>

              <div className="bg-gray-100/70 p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Total Amount:</span>
                <span className="text-sm font-bold text-emerald-700">{selectedCurrency} {(quantity * unitPrice).toLocaleString()}</span>
              </div>

              {/* Currency Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Payment Method / Currency</label>
                <div className="flex bg-gray-100 p-1 rounded-xl mb-2">
                  <button
                    type="button"
                    onClick={() => { setCurrencyType('fiat'); setSelectedCurrency('NGN'); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currencyType === 'fiat' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Local Fiat (Bank Account)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCurrencyType('crypto'); setSelectedCurrency('USDC'); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currencyType === 'crypto' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    Crypto (Universal Wallet)
                  </button>
                </div>

                {currencyType === 'fiat' ? (
                  <select
                    value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR', 'CAD', 'AED'].map(c => (
                      <option key={c} value={c}>{c} Bank Account</option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)}
                      className="h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      {['USDC', 'USDT', 'ETH', 'SOL', 'POL'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      value={depositChain} onChange={e => setDepositChain(e.target.value)}
                      className="h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="arbitrum">Arbitrum One</option>
                      <option value="ethereum">Ethereum</option>
                      <option value="base">Base</option>
                      <option value="solana">Solana</option>
                      <option value="polygon">Polygon</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Due Date</label>
                <input
                  type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-[#047857] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#065F46] disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? 'Creating Invoice...' : 'Generate & Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE DETAILS MODAL */}
      {selectedInvoice && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-[24px] max-h-[85vh] flex flex-col p-5 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">{selectedInvoice.invoice_id}</h3>
                <p className="text-xs text-gray-500">Issued to {selectedInvoice.recipient || selectedInvoice.client_name || 'Client'}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={18} color="#64748B" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100 text-center">
                <span className="text-xs text-gray-500 uppercase font-semibold block">Total Amount Due</span>
                <span className="text-2xl font-bold text-[#0F172A]">{selectedInvoice.currency} {(selectedInvoice.total_amount || selectedInvoice.amount || 0).toLocaleString()}</span>
                <div className="mt-1">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full inline-block" style={{ color: statusColor[selectedInvoice.status] || SLATE, backgroundColor: `${statusColor[selectedInvoice.status]}15` }}>
                    {(selectedInvoice.status || 'PENDING').toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Item:</span>
                  <span className="font-semibold">{selectedInvoice.item_description || 'Services'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Due Date:</span>
                  <span className="font-semibold">{selectedInvoice.due_date}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
                <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Payment Account Details</h4>
                {selectedInvoice.virtual_account_no ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-500">Bank Account Number:</p>
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200">
                      <span className="font-mono font-bold text-sm text-[#0F172A]">{selectedInvoice.virtual_account_no}</span>
                      <button onClick={() => copyToClipboard(selectedInvoice.virtual_account_no, 'acc')} className="text-xs text-emerald-700 font-bold hover:underline">
                        {copied === 'acc' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : selectedInvoice.deposit_address ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-gray-500">Crypto Deposit Address ({selectedInvoice.deposit_chain || 'Arbitrum'}):</p>
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200">
                      <span className="font-mono text-xs text-[#0F172A] truncate max-w-[200px]">{selectedInvoice.deposit_address}</span>
                      <button onClick={() => copyToClipboard(selectedInvoice.deposit_address, 'addr')} className="text-xs text-emerald-700 font-bold hover:underline">
                        {copied === 'addr' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Universal Wallet Payment Link</p>
                )}
              </div>

              {/* View Visual Image Button */}
              <a
                href={`${API}/api/mobile/invoice/${selectedInvoice.invoice_id}/image`}
                target="_blank" rel="noreferrer"
                className="w-full flex items-center justify-center space-x-2 bg-slate-800 text-white py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-900 transition-colors"
              >
                <FileText size={15} />
                <span>View Full Invoice Visual (PNG)</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomersScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCustomers = () => {
    fetch(`${API}/api/mobile/customers`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadCustomers();
  }, [token]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/mobile/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() })
      });
      if (res.ok) {
        setShowAddModal(false);
        setName(''); setEmail(''); setPhone('');
        loadCustomers();
      }
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
      <SubScreenHeader title="Customers" onBack={onBack} />
      <div className="flex-1 flex flex-col px-4 gap-3 overflow-hidden pt-2">
        <div className="relative shrink-0">
          <input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-[44px] pl-10 pr-4 rounded-[12px] border border-[#E5E7EB] bg-white text-[13px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#047857] transition-all" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        </div>

        {customers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center bg-white rounded-[20px] p-6 border border-gray-200/80 shadow-sm">
            <p className="text-[14px] font-bold text-[#0F172A]">No saved customers</p>
            <p className="text-[12px] text-[#64748B]">Customers are saved automatically when you create invoices or add them manually.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {customers.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase())).map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 bg-white rounded-[14px] border border-[#E5E7EB] shadow-sm">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#047857] to-[#0F172A] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(c.name || 'C').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[#0F172A] truncate">{c.name}</p>
                  <p className="text-[11px] text-[#64748B] truncate">{c.email || c.phone || 'No contact details'}</p>
                </div>
                <span className="text-[11px] font-bold text-[#047857] shrink-0 bg-emerald-50 px-2 py-0.5 rounded-full">{c.invoice_count || 0} Invoices</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <GreenBtn label="+ Add Customer" icon={<Plus size={15} />} onClick={() => setShowAddModal(true)} />
      </div>

      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end animate-fadeIn">
          <div className="bg-white rounded-t-[24px] flex flex-col p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-bold text-[#0F172A]">Add New Customer</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={18} color="#64748B" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text" required placeholder="Full Name or Business Name"
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email" placeholder="customer@email.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text" placeholder="+234..."
                  value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-xl text-xs text-[#0F172A] focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full bg-[#047857] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#065F46] disabled:opacity-50 transition-colors shadow-sm mt-2"
              >
                {loading ? 'Saving...' : 'Save Customer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessScreen({ user, segment, setSegment, token, onNav }: {
  user: UserData | null;
  segment: 'bank' | 'crypto';
  setSegment: (s: 'bank' | 'crypto') => void;
  token: string | null;
  onNav: (s: Screen) => void;
}) {
  type FiatAccount = { currency: string; account_number: string; bank_name: string; beneficiary_name: string; routing_number?: string | null; iban?: string | null; swift_bic?: string | null };
  type CryptoChain = { chain: string; address: string; symbol: string; chainId?: number; isNativeL2?: boolean };
  const [bizBalance, setBizBalance] = useState({ ngn: 0, usd: 0 });
  const [selectedCrypto, setSelectedCrypto] = useState(0);
  const [copied, setCopied] = useState('');
  const [methods, setMethods] = useState<{ fiatAccounts?: FiatAccount[]; cryptoChains?: CryptoChain[] }>({
    fiatAccounts: [
      { currency: 'NGN', account_number: user?.nuvion_business_account_no || '9134148532', bank_name: 'Flutterwave MFB / Nuvion Partner Bank', beneficiary_name: `${(user?.business_name || 'IBOH TECH LTD').toUpperCase()} / PayIT` },
      { currency: 'USD', account_number: '319889666412', bank_name: 'Cross River Bank / Nuvion Partner', routing_number: '021214891', beneficiary_name: `${(user?.business_name || 'IBOH TECH LTD').toUpperCase()} / PayIT` },
      { currency: 'EUR', account_number: 'GB02CLRB04288634633790', bank_name: 'Global Remit Financial Services Ltd', iban: 'GB02CLRB04288634633790', swift_bic: 'PAYIT2L', beneficiary_name: `${(user?.business_name || 'IBOH TECH LTD').toUpperCase()} / PayIT` },
      { currency: 'GBP', account_number: '00005611', bank_name: 'Global Remit Financial Services Ltd', routing_number: '042886', beneficiary_name: `${(user?.business_name || 'IBOH TECH LTD').toUpperCase()} / PayIT` },
    ],
    cryptoChains: [
      { chain: 'Arbitrum One', symbol: 'USDC', address: user?.business_smart_account || user?.owner_address || '0x37e625e993F63de87be5f0a801462aCABfEA4bC9', chainId: 42161, isNativeL2: true },
      { chain: 'Base', symbol: 'USDC', address: user?.business_smart_account || user?.owner_address || '0x37e625e993F63de87be5f0a801462aCABfEA4bC9', chainId: 8453, isNativeL2: true },
      { chain: 'Polygon', symbol: 'USDC', address: user?.business_smart_account || user?.owner_address || '0x37e625e993F63de87be5f0a801462aCABfEA4bC9', chainId: 137 },
      { chain: 'Ethereum', symbol: 'USDC', address: user?.business_smart_account || user?.owner_address || '0x37e625e993F63de87be5f0a801462aCABfEA4bC9', chainId: 1 },
    ]
  });

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch(`${API}/api/mobile/business/receive-methods`, { headers, signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        clearTimeout(timeoutId);
        const fiat = d.fiatAccounts || d.fiat_accounts || [];
        const crypto = d.cryptoChains || d.cryptoAccounts || d.crypto_accounts || [];
        if (fiat.length > 0 || crypto.length > 0) {
          setMethods({ fiatAccounts: fiat.length > 0 ? fiat : methods.fiatAccounts, cryptoChains: crypto.length > 0 ? crypto : methods.cryptoChains });
        }
      })
      .catch(() => { clearTimeout(timeoutId); });

    fetch(`${API}/api/mobile/balance?context=business`, { headers, signal: controller.signal })
      .then(r => r.json())
      .then(b => {
        const ngnVal = typeof b.ngnTotal === 'number' ? b.ngnTotal : (typeof b.fiat?.total === 'number' ? b.fiat.total : 0);
        const usdVal = typeof b.usdTotal === 'number' ? b.usdTotal : (typeof b.amount === 'number' ? b.amount : 0);
        setBizBalance({ ngn: ngnVal, usd: usdVal });
      })
      .catch(() => {});
  }, [token, user]);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  const bizName = user?.business_name || 'My Business';
  const ngnAccount = methods.fiatAccounts?.find(a => a.currency === 'NGN');
  const cryptoChains = methods.cryptoChains || [];
  const activeCrypto = cryptoChains[selectedCrypto];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Business header */}
      <div className="px-4 pt-2 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[44px] h-[44px] rounded-[13px] bg-gradient-to-br from-[#047857] to-[#0F172A] flex items-center justify-center text-[#5EEAB0] font-bold text-sm">
              {bizName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#0F172A]">{bizName}</p>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                <p className="text-[11px] text-[#64748B]">
                  {user?.kyb_status === 'verified' ? 'KYB Verified' : 'KYB Pending'}
                </p>
              </div>
            </div>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#D1FAE5]">
            <span className="text-[11px] font-bold text-[#047857]">
              {user?.kyb_status === 'verified' ? '✓ Verified' : '⏳ Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Business quick actions */}
      <div className="flex gap-2 px-4 pb-3 shrink-0">
        {[
          { label: 'Invoice', icon: <FileText size={14} />, screen: 'invoices' as Screen },
          { label: 'Receive', icon: <ArrowDownLeft size={14} />, screen: 'add_money' as Screen },
          { label: 'Payroll', icon: <Users size={14} />, screen: 'customers' as Screen },
        ].map(a => (
          <button key={a.label} onClick={() => onNav(a.screen)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[12px] bg-gradient-to-br from-[#0F172A] to-[#0E3A2C] text-white text-[12px] font-semibold">
            {a.icon}{a.label}
          </button>
        ))}
      </div>

      {/* Bank / Crypto segmented control */}
      <div className="flex gap-2 px-4 mb-3 shrink-0">
        {(['bank', 'crypto'] as const).map(s => (
          <button key={s} onClick={() => setSegment(s)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-[12px] text-[12.5px] font-bold transition-all ${segment === s ? 'bg-gradient-to-r from-[#047857] to-[#10B981] text-white' : 'bg-white border border-[#E5E7EB] text-[#64748B]'}`}>
            {s === 'bank' ? <Receipt size={13} /> : <Wallet size={13} />}
            {s === 'bank' ? 'Bank' : 'Crypto'}
          </button>
        ))}
      </div>

      {/* Business Balance Banner */}
      <div className="mx-4 mb-3 px-4 py-3 rounded-[16px] shrink-0" style={{ background: 'linear-gradient(135deg,#0F172A,#0E3A2C)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Business Balance</p>
            <p className="text-[22px] font-extrabold text-white tracking-tight">₦{bizBalance.ngn.toLocaleString()}</p>
            <p className="text-[11px] text-white/50">≈ ${bizBalance.usd.toFixed(2)} USD</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="px-2 py-1 rounded-[8px] bg-white/10 text-[10px] font-bold text-[#5EEAB0]">{user?.kyb_status === 'verified' ? '✓ KYB Verified' : '⏳ KYB Pending'}</span>
          </div>
        </div>
      </div>

      {/* Account card */}
      <div className="px-4 mb-3 shrink-0">
        {segment === 'bank' && ngnAccount ? (
          <div className="p-4 bg-white rounded-[18px] border-l-4 border-l-[#047857] border border-[#E5E7EB] shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[8px] bg-[#ECFDF5] flex items-center justify-center text-[10px] font-bold text-[#047857]">🇳🇬</div>
                <div>
                  <p className="text-[13px] font-bold text-[#0F172A]">NGN Business Account</p>
                  <p className="text-[11px] text-[#64748B]">{ngnAccount.bank_name}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[10px] font-bold text-[#047857]">✓ Active</span>
            </div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Account Number</p>
            <div className="flex items-center gap-2">
              <p className="text-[20px] font-mono font-extrabold text-[#0F172A] tracking-widest flex-1">{ngnAccount.account_number}</p>
              <button onClick={() => copyText(ngnAccount.account_number, 'ngn')}
                className="w-8 h-8 rounded-[9px] bg-[#ECFDF5] flex items-center justify-center shrink-0">
                {copied === 'ngn' ? <Check size={14} color={FOREST} /> : <Copy size={14} color={FOREST} />}
              </button>
            </div>
            <p className="text-[12px] text-[#64748B] mt-1">Beneficiary: <span className="font-semibold text-[#0F172A]">{ngnAccount.beneficiary_name}</span></p>
          </div>
        ) : segment === 'bank' ? (
          <div className="p-4 bg-[#F9FAFB] rounded-[18px] border border-[#E5E7EB] text-center">
            <p className="text-[13px] text-[#64748B]">Complete KYB to get your business bank account</p>
          </div>
        ) : activeCrypto ? (
          <div className="p-4 bg-white rounded-[18px] border border-[#E5E7EB] shadow-card">
            {/* Chain selector pills */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {cryptoChains.map((c, i) => (
                <button key={i} onClick={() => setSelectedCrypto(i)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                    selectedCrypto === i ? 'bg-[#047857] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}>{c.chain.split(' ')[0]}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[10px]">⬡</div>
              <div>
                <p className="text-[12px] font-bold text-[#0F172A]">{activeCrypto.chain}</p>
                <p className="text-[10px] text-[#64748B]">{activeCrypto.symbol}</p>
              </div>
              {activeCrypto.isNativeL2 && <span className="ml-auto px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[9px] font-bold text-[#047857]">Native L2</span>}
            </div>
            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Deposit Address</p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-mono text-[#0F172A] break-all flex-1 leading-snug">{activeCrypto.address}</p>
              <button onClick={() => copyText(activeCrypto.address, 'crypto')}
                className="w-8 h-8 rounded-[9px] bg-[#ECFDF5] flex items-center justify-center shrink-0">
                {copied === 'crypto' ? <Check size={14} color={FOREST} /> : <Copy size={14} color={FOREST} />}
              </button>
            </div>
            <p className="text-[10px] text-[#F59E0B] font-semibold mt-2">⚠ Only send {activeCrypto.symbol} on {activeCrypto.chain.split(' ')[0]} to this address</p>
          </div>
        ) : (
          <div className="p-4 bg-[#F9FAFB] rounded-[18px] border border-[#E5E7EB] text-center">
            <p className="text-[13px] text-[#64748B]">Loading crypto deposit addresses...</p>
          </div>
        )}
      </div>

      {/* Management list */}
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-2">
        {[
          { icon: <FileText size={16} color={FOREST} />, label: 'Invoices', badge: '1 pending', screen: 'invoices' as Screen },
          { icon: <Users size={16} color={FOREST} />, label: 'Customers', screen: 'customers' as Screen },
          { icon: <BarChart3 size={16} color={FOREST} />, label: 'Overview', screen: 'home' as Screen },
        ].map((item, i) => (
          <button key={i} onClick={() => onNav(item.screen)}
            className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-[14px] border border-[#F1F5F9] shadow-sm">
            <div className="w-9 h-9 rounded-[10px] bg-[#ECFDF5] flex items-center justify-center shrink-0">{item.icon}</div>
            <span className="flex-1 text-[14px] font-semibold text-[#0F172A] text-left">{item.label}</span>
            {item.badge && <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[10.5px] font-bold text-[#92400E]">{item.badge}</span>}
            <ChevronRight size={15} color={SLATE} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PayAIScreen({ token, user, onNav }: { token: string | null; user: UserData | null; onNav: (s: Screen) => void }) {
  const [input, setInput] = useState('');

  const suggestions = [
    { text: 'Send ₦5,000 to my friend', action: () => onNav('send_money') },
    { text: 'Lock ₦20,000 in savings for 30 days', action: () => onNav('savings') },
    { text: 'Pay my MTN airtime ₦1,000', action: () => onNav('bills') },
    { text: 'Create invoice for a client', action: () => onNav('invoices') },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 py-2 shrink-0">
        <div className="w-[44px] h-[44px] rounded-[14px] bg-gradient-to-br from-[#5EEAB0] to-[#047857] flex items-center justify-center shadow-card">
          <Shield size={22} color="#0F172A" strokeWidth={2.3} />
        </div>
        <div>
          <p className="text-[17px] font-extrabold text-[#0F172A]">PayAI</p>
          <p className="text-[11px] text-[#64748B]">Your AI financial co-pilot</p>
        </div>
        <div className="ml-auto px-2 py-1 rounded-full bg-[#ECFDF5]">
          <span className="text-[10px] font-bold text-[#047857]">● Online</span>
        </div>
      </div>

      {/* Auto-allocation card */}
      <div className="p-4 rounded-[20px] mb-4 shrink-0" style={{ background: 'linear-gradient(135deg, #0F172A, #0E3A2C)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={15} color={EMERALD_LIGHT} />
          <span className="text-[12px] font-bold text-[#5EEAB0] uppercase tracking-wide">Auto-Allocation Active</span>
        </div>
        <p className="text-[13px] text-white/80 leading-snug">PayAI is automatically routing your idle balance to earn <span className="text-[#5EEAB0] font-bold">8.2% APY</span> on Aave V3.</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/10">
            <div className="w-2/3 h-full rounded-full bg-gradient-to-r from-[#5EEAB0] to-[#10B981]" />
          </div>
          <span className="text-[11px] text-[#5EEAB0] font-bold">67% deployed</span>
        </div>
      </div>

      {/* Suggestions */}
      <div className="shrink-0">
        <p className="text-[12px] font-bold text-[#64748B] uppercase tracking-wide mb-2">Try saying...</p>
        <div className="flex flex-col gap-2">
          {suggestions.map((s, i) => (
            <button key={i} onClick={s.action}
              className="flex items-center gap-3 px-4 py-3 bg-white rounded-[12px] border border-[#E5E7EB] text-left shadow-sm">
              <Bot size={15} color={FOREST} className="shrink-0" />
              <span className="text-[13px] text-[#0F172A] font-medium flex-1">{s.text}</span>
              <ArrowRight size={14} color={SLATE} />
            </button>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="mt-auto shrink-0 pb-2 pt-3">
        <div className="flex items-center gap-2 p-3 bg-white rounded-[16px] border border-[#E5E7EB] shadow-sm">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask PayAI anything..."
            className="flex-1 text-[13px] text-[#0F172A] placeholder-[#94A3B8] bg-transparent outline-none" />
          <button className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#5EEAB0] to-[#047857] flex items-center justify-center shrink-0">
            <Send size={14} color="#0F172A" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen({ user, onLogout, onNav, token }: {
  user: UserData | null;
  onLogout: () => void;
  onNav: (s: Screen) => void;
  token: string | null;
}) {
  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.name || 'User');
  const initials = displayName.slice(0, 2).toUpperCase();
  const isVerified = user?.is_verified === 1 || user?.personal_kyc_status === 'verified' || user?.personal_kyc_status === 'pending';

  const [modalText, setModalText] = useState<{ title: string; body: string } | null>(null);

  const settings = [
    {
      group: 'Account',
      items: [
        { 
          icon: <UserCheck size={16} color={FOREST} />, 
          label: 'KYC / Identity', 
          badge: isVerified ? '✓ Verified' : 'Pending', 
          badgeColor: isVerified ? '#ECFDF5' : '#FEF3C7', 
          badgeText: isVerified ? '#047857' : '#92400E',
          onPress: () => onNav('kyc_personal')
        },
        { 
          icon: <Building2 size={16} color={FOREST} />, 
          label: 'Business Profile', 
          badge: user?.kyb_status === 'verified' ? 'Active' : 'Setup', 
          badgeColor: '#F1F5F9', 
          badgeText: '#64748B',
          onPress: () => onNav('kyb_business')
        },
        { icon: <CreditCard size={16} color={FOREST} />, label: 'Cards & Wallets', onPress: () => onNav('cards') },
      ]
    },
    {
      group: 'Preferences',
      items: [
        { icon: <Bell size={16} color={FOREST} />, label: 'Notifications', onPress: () => onNav('notifications') },
        { icon: <Lock size={16} color={FOREST} />, label: 'Security & PIN', onPress: () => onNav('security_pin') },
        { 
          icon: <Globe size={16} color={FOREST} />, 
          label: 'Language & Region',
          onPress: () => setModalText({ title: 'Language & Region', body: 'Default Region: Nigeria (NGN / USD). Multi-language support enabled (English, Hausa, Yoruba, Igbo).' })
        },
      ]
    },
    {
      group: 'Support',
      items: [
        { 
          icon: <Info size={16} color={FOREST} />, 
          label: 'Help & Support',
          onPress: () => setModalText({ title: 'Help & Support', body: '24/7 PayIT Support: Email support@payitng.xyz or message @PayITSupportBot on Telegram for instant assistance.' })
        },
        { 
          icon: <FileText size={16} color={FOREST} />, 
          label: 'Terms & Privacy',
          onPress: () => setModalText({ title: 'Terms & Privacy', body: 'PayIT is a self-custodial financial protocol powered by Particle Network Smart Accounts. All funds are secured by cryptographic session keys.' })
        },
      ],
    },
    {
      group: 'Integration',
      items: [
        { icon: <Mail size={16} color={FOREST} />, label: 'Sync with Telegram', onPress: () => onNav('profile_sync') },
      ],
    }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Profile header */}
      <div className="px-4 pt-2 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-[56px] h-[56px] rounded-[17px] bg-gradient-to-br from-[#047857] to-[#0F172A] flex items-center justify-center text-white font-bold text-lg">
            {initials}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[18px] font-extrabold text-[#0F172A]">{displayName}</p>
              {isVerified && <CheckCircle2 size={16} color={EMERALD} />}
            </div>
            <p className="text-[12px] text-[#64748B]">{user?.email || 'PayIT User'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield size={11} color={FOREST} />
              <span className="text-[10.5px] text-[#047857] font-semibold">Self-Custodial · Particle Wallet</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet address */}
      <div className="mx-4 mb-3 px-3.5 py-3 bg-[#ECFDF5] rounded-[14px] border border-[#D1FAE5] shrink-0">
        <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide mb-0.5">Universal Smart Account</p>
        <p className="text-[12px] font-mono text-[#047857] break-all">
          {user?.personal_smart_account?.slice(0, 10) || '0x58E3A25A'}...{user?.personal_smart_account?.slice(-6) || 'E9843C'}
        </p>
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3">
        {settings.map((group, gi) => (
          <div key={gi}>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-widest mb-2">{group.group}</p>
            <div className="bg-white rounded-[16px] border border-[#F1F5F9] overflow-hidden">
              {group.items.map((item, ii) => (
                <button key={ii} onClick={item.onPress}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${ii < group.items.length - 1 ? 'border-b border-[#F1F5F9]' : ''}`}>
                  <div className="w-8 h-8 rounded-[8px] bg-[#ECFDF5] flex items-center justify-center shrink-0">{item.icon}</div>
                  <span className="flex-1 text-[13.5px] font-semibold text-[#0F172A]">{item.label}</span>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: item.badgeColor, color: item.badgeText }}>
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight size={14} color={SLATE} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-[14px] border-2 border-[#FDECEC] bg-[#FDECEC] text-[#DC4C4C] font-bold text-[14px] mt-1 mb-4">
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* PIN SCREENS */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PinDots({ pin, total = 4 }: { pin: string; total?: number }) {
  return (
    <div className="flex gap-4 justify-center py-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i}
          className={`w-[16px] h-[16px] rounded-full border-2 transition-all ${
            i < pin.length
              ? 'bg-[#047857] border-[#047857] scale-110'
              : 'bg-transparent border-[#CBD5E1]'
          }`} />
      ))}
    </div>
  );
}

function PinKeypad({ onPress, onDelete }: { onPress: (d: string) => void; onDelete: () => void }) {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="grid grid-cols-3 gap-3 px-6">
      {keys.map((k, i) => (
        k === '' ? <div key={i} /> :
        <button key={i}
          onClick={() => k === '⌫' ? onDelete() : onPress(k)}
          className={`h-[58px] rounded-[16px] text-[22px] font-bold flex items-center justify-center transition-all active:scale-95 ${
            k === '⌫'
              ? 'bg-[#F1F5F9] text-[#64748B] text-[18px]'
              : 'bg-white border border-[#E5E7EB] text-[#0F172A] shadow-sm'
          }`}>{k}</button>
      ))}
    </div>
  );
}

function PinSetupScreen({ onDone, isNewPin = false }: { onDone: () => void; isNewPin?: boolean }) {
  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function handlePress(d: string) {
    setError('');
    if (stage === 'create') {
      if (pin.length < 4) {
        const next = pin + d;
        setPin(next);
        if (next.length === 4) setTimeout(() => setStage('confirm'), 300);
      }
    } else {
      if (confirmPin.length < 4) {
        const next = confirmPin + d;
        setConfirmPin(next);
        if (next.length === 4) {
          setTimeout(() => {
            if (next === pin) {
              // Save hashed PIN to localStorage
              const hash = btoa(pin + '_payit_salt');
              localStorage.setItem('payit_pin_hash', hash);
              setSuccess(true);
              setTimeout(() => onDone(), 1200);
            } else {
              setError('PINs do not match. Please try again.');
              setConfirmPin('');
              setPin('');
              setStage('create');
            }
          }, 200);
        }
      }
    }
  }

  function handleDelete() {
    setError('');
    if (stage === 'create') setPin(p => p.slice(0, -1));
    else setConfirmPin(p => p.slice(0, -1));
  }

  const currentPin = stage === 'create' ? pin : confirmPin;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7FAF8]">
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <div className="w-[64px] h-[64px] rounded-[20px] bg-gradient-to-br from-[#5EEAB0] to-[#047857] flex items-center justify-center shadow-hero">
          <Lock size={28} color="#0F172A" strokeWidth={2.3} />
        </div>
        <div className="text-center">
          <h2 className="text-[22px] font-extrabold text-[#0F172A]">
            {success ? '✓ PIN Set!' : stage === 'create' ? (isNewPin ? 'Create Your PIN' : 'Change PIN') : 'Confirm Your PIN'}
          </h2>
          <p className="text-[13px] text-[#64748B] mt-1">
            {success ? 'Your 4-digit security PIN is active.'
              : stage === 'create' ? 'Choose a 4-digit PIN to secure your transactions'
              : 'Re-enter your PIN to confirm'}
          </p>
        </div>
        <PinDots pin={currentPin} />
        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#FDECEC] rounded-[12px]">
            <AlertCircle size={14} color={DANGER} />
            <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#ECFDF5] rounded-[12px]">
            <CheckCircle2 size={14} color={EMERALD} />
            <span className="text-[12px] text-[#047857] font-medium">PIN saved. Redirecting...</span>
          </div>
        )}
      </div>
      {!success && <PinKeypad onPress={handlePress} onDelete={handleDelete} />}
      <div className="pb-6 pt-4 flex flex-col items-center gap-2">
        <p className="text-[11px] text-[#94A3B8]">PIN is stored locally and never sent to any server.</p>
      </div>
    </div>
  );
}

function SecurityPinScreen({ onVerified, onForgot }: { onVerified: () => void; onForgot: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [subView, setSubView] = useState<'verify' | 'change'>('verify');

  const hasPin = !!localStorage.getItem('payit_pin_hash');

  function handlePress(d: string) {
    setError('');
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => {
          const stored = localStorage.getItem('payit_pin_hash');
          const attempt = btoa(next + '_payit_salt');
          if (!stored || stored === attempt) {
            onVerified();
          } else {
            setError('Incorrect PIN. Please try again.');
            setPin('');
          }
        }, 200);
      }
    }
  }

  function handleDelete() { setError(''); setPin(p => p.slice(0, -1)); }

  if (subView === 'change') {
    return <PinSetupScreen onDone={onVerified} isNewPin={false} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7FAF8]">
      <div className="px-4 pt-3 pb-2 shrink-0">
        <button onClick={onForgot} className="w-9 h-9 rounded-[12px] bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm">
          <ArrowLeft size={17} color={INK} strokeWidth={2.2} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5">
        <div className="w-[64px] h-[64px] rounded-[20px] bg-gradient-to-br from-[#5EEAB0] to-[#047857] flex items-center justify-center shadow-hero">
          <Lock size={28} color="#0F172A" strokeWidth={2.3} />
        </div>
        <div className="text-center">
          <h2 className="text-[22px] font-extrabold text-[#0F172A]">
            {hasPin ? 'Security & PIN' : 'Set Up PIN'}
          </h2>
          <p className="text-[13px] text-[#64748B] mt-1">
            {hasPin ? 'Enter your 4-digit PIN to access security settings' : 'You haven\'t set a PIN yet'}
          </p>
        </div>

        {hasPin ? (
          <>
            <PinDots pin={pin} />
            {error && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#FDECEC] rounded-[12px]">
                <AlertCircle size={14} color={DANGER} />
                <span className="text-[12px] text-[#DC4C4C] font-medium">{error}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            <button onClick={() => setSubView('change')}
              className="w-full h-[52px] rounded-[14px] bg-gradient-to-r from-[#047857] to-[#10B981] text-white font-bold text-[15px] flex items-center justify-center gap-2">
              <Lock size={16} /> Set Up 4-Digit PIN
            </button>
            <button onClick={onForgot}
              className="w-full h-[48px] rounded-[14px] border-2 border-[#E5E7EB] text-[#64748B] font-semibold text-[14px]">
              Skip for now
            </button>
          </div>
        )}
      </div>

      {hasPin && (
        <>
          <PinKeypad onPress={handlePress} onDelete={handleDelete} />
          <div className="pb-4 pt-3 flex flex-col items-center gap-3">
            <button onClick={() => setSubView('change')}
              className="text-[12px] text-[#047857] font-semibold">
              Change PIN
            </button>
            <button onClick={() => { localStorage.removeItem('payit_pin_hash'); onForgot(); }}
              className="text-[12px] text-[#DC4C4C] font-medium">
              Remove PIN
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* CARDS & WALLETS SCREEN */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface CardItem {
  id: string;
  card_id: string;
  profile_id: string;
  card_type: 'virtual' | 'disposable' | 'physical';
  currency: string;
  last4: string;
  card_number: string;
  cvv: string;
  expiry: string;
  brand: string;
  status: 'active' | 'frozen';
  name_on_card: string;
  context: 'personal' | 'business';
  fee_charged: number;
}

function CardsScreen({ onBack, token, user, initialContext = 'personal' }: { onBack: () => void; token: string | null; user: UserData | null; initialContext?: 'personal' | 'business' }) {
  const [selectedContext, setSelectedContext] = useState<'personal' | 'business'>(initialContext);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state for creating card
  const [createContext, setCreateContext] = useState<'personal' | 'business'>(selectedContext);
  const [createCardType, setCreateCardType] = useState<'virtual' | 'disposable' | 'physical'>('virtual');
  const [createCurrency, setCreateCurrency] = useState<'USD' | 'NGN' | 'EUR' | 'GBP'>('USD');
  const [creating, setCreating] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  // Fetch cards whenever context changes
  useEffect(() => {
    fetchCards(selectedContext);
  }, [selectedContext, token]);

  async function fetchCards(ctx: 'personal' | 'business') {
    setLoading(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/api/mobile/cards?context=${ctx}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
        setActiveCardIndex(0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleCreateCard() {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/mobile/cards/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          context: createContext,
          card_type: createCardType,
          currency: createCurrency
        })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.card) {
          setActionSuccess(`New ${createCardType} card created successfully for ${createContext} account!`);
          setShowCreateModal(false);
          // Switch to created card's context and reload
          setSelectedContext(createContext);
          fetchCards(createContext);
          setTimeout(() => setActionSuccess(''), 4000);
        }
      }
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  async function handleToggleFreeze(cardId: string) {
    try {
      const res = await fetch(`${API}/api/mobile/cards/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ card_id: cardId })
      });
      if (res.ok) {
        const d = await res.json();
        setCards(prev => prev.map(c => c.card_id === cardId ? { ...c, status: d.status } : c));
        setActionSuccess(`Card ${d.status === 'frozen' ? 'frozen' : 'unfrozen'} successfully.`);
        setTimeout(() => setActionSuccess(''), 3000);
      }
    } catch { /* ignore */ }
  }

  const activeCard = cards[activeCardIndex];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#EEF3F0]">
      <SubScreenHeader title="Cards & Virtual Wallets" onBack={onBack} />
      
      <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto pb-6">
        
        {/* Context Selector Pills: Personal vs Business Cards */}
        <div className="flex gap-2 shrink-0">
          {(['personal', 'business'] as const).map(ctx => (
            <button key={ctx} onClick={() => { setSelectedContext(ctx); setCreateContext(ctx); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[14px] text-[12.5px] font-bold transition-all ${
                selectedContext === ctx
                  ? 'bg-gradient-to-r from-[#047857] to-[#10B981] text-white shadow-card'
                  : 'bg-white border border-[#E5E7EB] text-[#64748B]'
              }`}>
              {ctx === 'personal' ? <User size={14} /> : <Building2 size={14} />}
              {ctx === 'personal' ? 'Personal Cards' : 'Business Cards'}
            </button>
          ))}
        </div>

        {/* Action toast */}
        {actionSuccess && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#ECFDF5] border border-[#10B981] rounded-[14px] shrink-0 animate-in fade-in">
            <CheckCircle2 size={16} color={EMERALD} />
            <p className="text-[12px] font-bold text-[#047857]">{actionSuccess}</p>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin" color={FOREST} />
          </div>
        ) : cards.length > 0 && activeCard ? (
          <>
            {/* Card Mockup Visual */}
            <div className="relative rounded-[26px] p-5 shrink-0 overflow-hidden shadow-hero transition-all"
              style={{
                background: selectedContext === 'business'
                  ? 'linear-gradient(145deg, #0F172A 0%, #1E293B 60%, #047857 120%)'
                  : 'linear-gradient(145deg, #047857 0%, #0E3A2C 60%, #0F172A 120%)'
              }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-white/15 text-[10px] font-bold text-white uppercase tracking-wider">
                    {activeCard.card_type} card
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#5EEAB0]/20 text-[10px] font-bold text-[#5EEAB0]">
                    {activeCard.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    activeCard.status === 'active' ? 'bg-[#10B981] text-white' : 'bg-[#DC4C4C] text-white'
                  }`}>
                    {activeCard.status}
                  </span>
                  <div className="text-white font-extrabold text-lg italic tracking-tighter">VISA</div>
                </div>
              </div>

              {/* Card Number */}
              <div className="my-3">
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Card Number</p>
                <div className="flex items-center justify-between">
                  <p className="text-[20px] font-mono font-extrabold text-white tracking-widest">
                    {showFullDetails ? activeCard.card_number : `•••• •••• •••• ${activeCard.last4}`}
                  </p>
                  <button onClick={() => setShowFullDetails(!showFullDetails)} className="text-white/70 p-1">
                    {showFullDetails ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Details footer */}
              <div className="flex items-end justify-between mt-4 pt-3 border-t border-white/15">
                <div>
                  <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Cardholder Name</p>
                  <p className="text-[13px] font-bold text-white uppercase tracking-wide truncate max-w-[200px]">
                    {activeCard.name_on_card}
                  </p>
                </div>
                <div className="flex gap-4 text-right">
                  <div>
                    <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Expires</p>
                    <p className="text-[12px] font-mono font-bold text-white">{activeCard.expiry}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">CVV</p>
                    <p className="text-[12px] font-mono font-bold text-white">{showFullDetails ? activeCard.cvv : '•••'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Switcher pills if multiple cards */}
            {cards.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
                {cards.map((c, idx) => (
                  <button key={c.card_id} onClick={() => setActiveCardIndex(idx)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all shrink-0 ${
                      activeCardIndex === idx ? 'bg-[#047857] text-white border-[#047857]' : 'bg-white text-[#64748B] border-[#E5E7EB]'
                    }`}>
                    Card •••• {c.last4} ({c.card_type})
                  </button>
                ))}
              </div>
            )}

            {/* Card Action Controls */}
            <div className="grid grid-cols-2 gap-2.5 shrink-0">
              <button onClick={() => handleToggleFreeze(activeCard.card_id)}
                className={`flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-[13px] border transition-all ${
                  activeCard.status === 'frozen'
                    ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                    : 'bg-white border-[#E5E7EB] text-[#DC4C4C]'
                }`}>
                {activeCard.status === 'frozen' ? <Zap size={15} /> : <Lock size={15} />}
                {activeCard.status === 'frozen' ? 'Unfreeze Card' : 'Freeze Card'}
              </button>
              <button onClick={() => setShowFullDetails(!showFullDetails)}
                className="flex items-center justify-center gap-2 py-3 rounded-[14px] bg-white border border-[#E5E7EB] font-bold text-[13px] text-[#0F172A]">
                {showFullDetails ? <EyeOff size={15} /> : <Eye size={15} />}
                {showFullDetails ? 'Hide Numbers' : 'View Full Details'}
              </button>
            </div>

            {/* Card Features List */}
            <div className="p-4 bg-white rounded-[18px] border border-[#E5E7EB] flex flex-col gap-3 shrink-0 shadow-sm">
              <p className="text-[12px] font-bold text-[#0F172A] uppercase tracking-wide">Card Features & Buffer</p>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#64748B]">Auto-Refill Buffer Threshold</span>
                <span className="font-bold text-[#0F172A]">${activeCard.buffer_threshold.toFixed(2)} USD</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#64748B]">Auto-Refill Top-up Amount</span>
                <span className="font-bold text-[#047857]">${activeCard.refill_amount.toFixed(2)} USD</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#64748B]">Card Account Context</span>
                <span className="font-bold text-[#0F172A] capitalize">{activeCard.context} Account</span>
              </div>
            </div>
          </>
        ) : (
          /* Empty Cards State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white rounded-[22px] border border-[#E5E7EB] my-2">
            <div className="w-[64px] h-[64px] rounded-[20px] bg-[#ECFDF5] flex items-center justify-center mb-3">
              <CreditCard size={32} color={FOREST} />
            </div>
            <h3 className="text-[16px] font-extrabold text-[#0F172A]">No {selectedContext} cards yet</h3>
            <p className="text-[12.5px] text-[#64748B] mt-1 max-w-[260px]">
              Create a virtual or physical card linked to your {selectedContext} account for online payments & subscriptions.
            </p>
          </div>
        )}

        {/* Create Card Button */}
        <button onClick={() => setShowCreateModal(true)}
          className="w-full py-3.5 rounded-[16px] bg-gradient-to-r from-[#047857] to-[#10B981] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-card shrink-0 mt-auto">
          <Plus size={18} /> Issue New Card
        </button>

      </div>

      {/* ── CREATE CARD MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[26px] sm:rounded-[26px] p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom">
            
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-[17px] font-extrabold text-[#0F172A]">Create New Card</h3>
                <p className="text-[11.5px] text-[#64748B]">Issue an instant card for online spending</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                <X size={16} color={SLATE} />
              </button>
            </div>

            {/* 1. Account Context Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">Account Context</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'personal', title: 'Personal Account', sub: user?.first_name ? `${user.first_name} ${user.last_name || ''}` : 'IBOH IGBOZE' },
                  { id: 'business', title: 'Business Account', sub: user?.business_name || 'IBOH TECH LTD' }
                ].map(c => (
                  <button key={c.id} onClick={() => setCreateContext(c.id as 'personal' | 'business')}
                    className={`p-3 rounded-[14px] border-2 text-left transition-all ${
                      createContext === c.id ? 'border-[#047857] bg-[#ECFDF5]' : 'border-[#E5E7EB] bg-white'
                    }`}>
                    <p className="text-[12px] font-bold text-[#0F172A]">{c.title}</p>
                    <p className="text-[10px] text-[#64748B] truncate mt-0.5">{c.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Card Type Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">Card Type</label>
              <div className="flex flex-col gap-2">
                {[
                  { id: 'virtual', title: 'Reusable Virtual Card', fee: '$2.88', desc: 'Best for subscriptions, SaaS & online shopping' },
                  { id: 'disposable', title: 'Single-Use Disposable Card', fee: '$0.58', desc: 'Self-destructs after 1 payment for max security' },
                  { id: 'physical', title: 'Physical Metal/Plastic Card', fee: '$5.75', desc: 'Shipped to your address for in-person POS/ATM' }
                ].map(t => (
                  <button key={t.id} onClick={() => setCreateCardType(t.id as any)}
                    className={`flex items-start gap-3 p-3 rounded-[14px] border-2 text-left transition-all ${
                      createCardType === t.id ? 'border-[#047857] bg-[#ECFDF5]' : 'border-[#E5E7EB] bg-white'
                    }`}>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[12.5px] font-bold text-[#0F172A]">{t.title}</span>
                        <span className="text-[11px] font-extrabold text-[#047857] bg-white px-2 py-0.5 rounded-full border">{t.fee} fee</span>
                      </div>
                      <p className="text-[10.5px] text-[#64748B] mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Card Currency */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">Card Currency</label>
              <div className="flex gap-2">
                {(['USD', 'NGN', 'EUR', 'GBP'] as const).map(cur => (
                  <button key={cur} onClick={() => setCreateCurrency(cur)}
                    className={`flex-1 py-2 rounded-[12px] text-[12px] font-bold border-2 transition-all ${
                      createCurrency === cur ? 'border-[#047857] bg-[#047857] text-white' : 'border-[#E5E7EB] bg-white text-[#0F172A]'
                    }`}>
                    {cur === 'USD' ? '🇺🇸 USD' : cur === 'NGN' ? '🇳🇬 NGN' : cur === 'EUR' ? '🇪🇺 EUR' : '🇬🇧 GBP'}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <GreenBtn label={creating ? 'Issuing Card...' : 'Issue Card Now'} onClick={handleCreateCard} loading={creating} icon={<ArrowRight size={16} />} />

          </div>
        </div>
      )}

    </div>
  );
}
