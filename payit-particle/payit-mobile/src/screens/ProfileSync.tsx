import React, { useState } from 'react';
import { Mail, CheckCircle2, X, Send, Key, RefreshCw, Copy, Check } from 'lucide-react';

interface ProfileSyncScreenProps {
  token: string | null;
  onBack: () => void;
}

const ProfileSyncScreen: React.FC<ProfileSyncScreenProps> = ({ token, onBack }) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'verify'>('generate');
  const [username, setUsername] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const getApiUrl = (endpoint: string) => {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.hostname}:3000${endpoint}`;
      }
      return `${window.location.origin}${endpoint}`;
    }
    return endpoint;
  };

  React.useEffect(() => {
    let interval: any = null;
    const checkStatus = async () => {
      try {
        const res = await fetch(getApiUrl('/api/mobile/check-sync-status'), {
          headers: getHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          if (data.is_synced) {
            setSuccessMsg('🎉 Telegram account linked successfully! Accounts are now synchronized.');
            setTimeout(() => {
              onBack();
            }, 2000);
          }
        }
      } catch (e) {}
    };

    checkStatus();
    interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerateCode = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      let res = await fetch(getApiUrl('/api/mobile/link-telegram'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ username: username.trim() })
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(getApiUrl('/api/app/link-telegram'), {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ username: username.trim() })
        });
      }
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.error || data.message || 'Failed to generate code.');
      }
      setGeneratedCode(data.code);
      setSuccessMsg('Sync code generated! Open Telegram and type: /sync ' + data.code);
    } catch (e: any) {
      setError(e.message || 'Failed to generate sync code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setError('Please enter a verification code.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      let res = await fetch(getApiUrl('/api/mobile/verify-telegram-sync'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          code: inputCode.trim(),
          telegramId: username.trim(),
          verificationCode: inputCode.trim()
        })
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(getApiUrl('/api/app/verify-telegram-sync'), {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            code: inputCode.trim(),
            telegramId: username.trim(),
            verificationCode: inputCode.trim()
          })
        });
      }
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.error || data.message || 'Failed to verify code.');
      }
      setSuccessMsg(data.message || 'Profile linked successfully!');
      setTimeout(() => {
        onBack();
      }, 1800);
    } catch (e: any) {
      setError(e.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(`/sync ${generatedCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col p-4 bg-white max-w-md mx-auto w-full min-h-screen">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A]">Sync Telegram Profile</h2>
          <p className="text-xs text-gray-500 mt-0.5">Link your mobile wallet with Telegram bot</p>
        </div>
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X size={20} color="#64748B" />
        </button>
      </div>

      <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
        <button
          onClick={() => { setActiveTab('generate'); setError(''); setSuccessMsg(''); }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'generate' ? 'bg-white text-[#047857] shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Generate App Code
        </button>
        <button
          onClick={() => { setActiveTab('verify'); setError(''); setSuccessMsg(''); }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'verify' ? 'bg-white text-[#047857] shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Enter Telegram Code
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-start space-x-2">
          <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'generate' ? (
        <div className="space-y-5">
          <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/60">
            <h3 className="text-sm font-semibold text-[#047857] mb-1">How it works</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Generate a 6-digit sync code here, then open our Telegram bot and send <span className="font-mono text-emerald-800 font-bold">/sync &lt;code&gt;</span> to link your accounts instantly.
            </p>
          </div>

          {generatedCode ? (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center space-y-3">
              <span className="text-xs text-gray-500 block uppercase tracking-wider font-semibold">Your Verification Code</span>
              <div className="text-3xl font-mono font-bold tracking-widest text-[#0F172A] bg-white py-3 px-4 rounded-lg border border-gray-200 inline-block shadow-inner">
                {generatedCode}
              </div>
              <p className="text-xs text-gray-500">Code expires in 10 minutes</p>
              
              <button
                onClick={handleCopyCode}
                className="w-full mt-2 flex items-center justify-center space-x-2 bg-emerald-600 text-white py-2.5 px-4 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copied Command!' : 'Copy /sync Command'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateCode}
              disabled={loading}
              className="w-full bg-[#047857] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#065F46] disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm transition-colors"
            >
              {loading && <RefreshCw size={16} className="animate-spin" />}
              <span>{loading ? 'Generating Code...' : 'Generate Sync Code'}</span>
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Enter code from Telegram</h3>
            <p className="text-xs text-blue-700 leading-relaxed">
              If you generated a code inside the Telegram bot using <span className="font-mono font-bold">/sync</span>, enter it below to complete linking.
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#0F172A]">6-Digit Sync Code</span>
            <input
              type="text"
              placeholder="e.g. 849201"
              maxLength={6}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-center font-mono text-lg font-bold tracking-widest focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[#0F172A]">Telegram Username or ID (Optional)</span>
            <input
              type="text"
              placeholder="e.g., @myusername"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading || !inputCode.trim()}
            className="w-full bg-[#047857] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#065F46] disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm transition-colors mt-2"
          >
            {loading && <RefreshCw size={16} className="animate-spin" />}
            <span>{loading ? 'Verifying...' : 'Verify & Bind Profile'}</span>
          </button>
        </form>
      )}
    </div>
  );
};

export default ProfileSyncScreen;
