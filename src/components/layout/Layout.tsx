import React, { useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { exportBackup, importBackup } from '../../utils/storage';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FileText, Users, ClipboardList, TrendingUp,
  Wrench, LogOut, Menu, X, ChevronDown, RefreshCw,
  Download, Upload, Cloud, CloudOff, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard/executive',  label: 'Executive',    icon: LayoutDashboard },
  { to: '/dashboard/financial',  label: 'Financial',    icon: TrendingUp      },
  { to: '/dashboard/operations', label: 'Operations',   icon: Wrench          },
  { to: '/dashboard/vendor',     label: 'Vendor',       icon: Users           },
  { to: '/requirements',         label: 'Requirements', icon: FileText        },
  { to: '/vendors',              label: 'Vendors',      icon: Users           },
  { to: '/records',              label: 'Records',      icon: ClipboardList   },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, data, syncStatus, syncError, isGitHub, reloadFromGitHub, updateData } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const restored = await importBackup(file);
      updateData(() => restored);
    } catch { alert('Invalid backup file.'); }
    e.target.value = '';
  };

  const SyncIcon = () => {
    if (!isGitHub) return <CloudOff size={14} className="text-white/40" title="GitHub not configured" />;
    if (syncStatus === 'loading') return <Loader2 size={14} className="text-white/70 animate-spin" />;
    if (syncStatus === 'saving')  return <Loader2 size={14} className="text-yellow-300 animate-spin" />;
    if (syncStatus === 'saved')   return <CheckCircle2 size={14} className="text-green-300" />;
    if (syncStatus === 'error')   return <AlertCircle size={14} className="text-red-300" title={syncError} />;
    return <Cloud size={14} className="text-white/60" title="Synced with GitHub" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#0d1b3e] text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-3 h-14 flex items-center justify-between gap-2">

          {/* Left: hamburger + title */}
          <div className="flex items-center gap-2 min-w-0">
            <button className="md:hidden p-1 rounded focus:outline-none focus:ring-2 focus:ring-white shrink-0"
              onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="font-bold text-xs sm:text-sm tracking-tight truncate">
              iON Survillance Temp. infra(CCTV)
            </span>
          </div>

          {/* Centre: desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center" aria-label="Main navigation">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => clsx(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                  isActive ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                )}>
                <item.icon size={13} />{item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right: sync + user menu */}
          <div className="flex items-center gap-2 shrink-0">
            <SyncIcon />
            {isGitHub && (
              <button onClick={reloadFromGitHub} title="Reload from GitHub"
                className="p-1 rounded text-white/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white">
                <RefreshCw size={13} />
              </button>
            )}

            {/* User dropdown */}
            <div className="relative">
              <button onClick={() => setUserMenuOpen(v => !v)} aria-expanded={userMenuOpen} aria-haspopup="true"
                className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white rounded px-1.5 py-1">
                <span className="hidden sm:inline max-w-[80px] truncate">{currentUser?.name}</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs capitalize hidden sm:inline">
                  {currentUser?.role.replace('_', ' ')}
                </span>
                <ChevronDown size={11} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border py-1 z-50"
                  onBlur={() => setUserMenuOpen(false)}>
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-gray-800">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{currentUser?.role.replace('_', ' ')}</p>
                  </div>
                  <button onClick={() => { exportBackup(data); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <Download size={13} /> Download Backup
                  </button>
                  <label className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <Upload size={13} /> Restore Backup
                    <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                  </label>
                  <div className="border-t mt-1">
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                      <LogOut size={13} /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-white/20 px-3 py-2 flex flex-col gap-0.5" aria-label="Mobile navigation">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-2 px-3 py-2 rounded text-sm',
                  isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
                )}>
                <item.icon size={15} />{item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Sync error banner */}
        {syncStatus === 'error' && (
          <div className="bg-red-600 text-white text-xs px-4 py-1 flex items-center gap-2">
            <AlertCircle size={12} />
            GitHub sync error: {syncError} — data saved locally.
          </div>
        )}
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
