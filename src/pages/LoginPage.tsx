import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/FormFields';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/index';
import { Cloud, CloudOff } from 'lucide-react';

export default function LoginPage() {
  const { login, isGitHub } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const ok = login(email, password);
      setLoading(false);
      if (ok) navigate('/dashboard/executive');
      else setError('Invalid email or password.');
    }, 300);
  };

  return (
    <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-[#0d1b3e] leading-tight">
            iON Survillance<br />Temp. infra(CCTV)
          </h1>
          <p className="text-xs text-gray-400 mt-1">Examination Venue CCTV Management</p>
        </div>

        {/* GitHub sync indicator */}
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 ${isGitHub ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
          {isGitHub
            ? <><Cloud size={13} /> Data synced with GitHub</>
            : <><CloudOff size={13} /> Local mode — configure GitHub token to enable sync</>
          }
        </div>

        {error && <div className="mb-3"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Email" type="email" value={email}
            onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@ion.com" />
          <Input label="Password" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
          <Button type="submit" disabled={loading} size="lg" className="w-full mt-1">
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-5 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-0.5">
          <p className="font-semibold text-gray-600 mb-1">Demo credentials</p>
          <p>superadmin@ion.com / Admin@123</p>
          <p>subadmin@ion.com / Sub@123</p>
          <p>user@ion.com / User@123</p>
          <p>viewer@ion.com / View@123</p>
        </div>
      </div>
    </div>
  );
}
