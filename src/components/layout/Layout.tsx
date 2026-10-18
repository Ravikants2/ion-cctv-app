import React, { useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { exportBackup, importBackup } from '../../utils/storage';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FileText, Users, ClipboardList, TrendingUp,
  Wrench, LogOut, Menu, X, ChevronDown, RefreshCw,
  Download, Upload, Cloud, CloudOff, Loader2, CheckCircle2, AlertCircle,
  MessageCircle,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard/executive',  label: 'Dashboard',         icon: LayoutDashboard, viewerVisible: true },
  { to: '/dashboard/financial',  label: 'Finance',            icon: TrendingUp,      viewerVisible: true },
  { to: '/dashboard/operations', label: 'Operations',         icon: Wrench,          viewerVisible: true },
  { to: '/dashboard/vendor',     label: 'Vendor Dashboard',   icon: Users,           viewerVisible: false },
  { to: '/requirements',         label: 'Requirements',       icon: FileText,        viewerVisible: false },
  { to: '/vendors',              label: 'Vendors',             icon: Users,           viewerVisible: true },
  { to: '/records',              label: 'Records',             icon: ClipboardList,  viewerVisible: false },
  { to: '/chat',                 label: 'AI Chat',             icon: MessageCircle,   viewerVisible: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, data, syncStatus, syncError, isGitHub, reloadFromGitHub, updateData } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const isViewer = currentUser?.role === 'viewer';
  const visibleNavItems = navItems.filter(item => !isViewer || item.viewerVisible);

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
    if (!isGitHub) return <span title="GitHub not configured"><CloudOff size={14} className="text-white/40" /></span>;
    if (syncStatus === 'loading') return <Loader2 size={14} className="text-white/70 animate-spin" />;
    if (syncStatus === 'saving')  return <Loader2 size={14} className="text-yellow-300 animate-spin" />;
    if (syncStatus === 'saved')   return <CheckCircle2 size={14} className="text-green-300" />;
    if (syncStatus === 'error')   return <span title={syncError}><AlertCircle size={14} className="text-red-300" /></span>;
    return <span title="Synced with GitHub"><Cloud size={14} className="text-white/60" /></span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-slate-950 text-white sticky top-0 z-40 border-b border-white/10 shadow-xl shadow-slate-950/10">
        <div className="max-w-screen-2xl mx-auto px-4 h-[68px] flex items-center justify-between gap-4">

          {/* Left: hamburger + title */}
          <div className="flex items-center gap-2 min-w-0">
            <button className="md:hidden p-1 rounded focus:outline-none focus:ring-2 focus:ring-white shrink-0"
              onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-blue-950/40">
              <LayoutDashboard size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight sm:text-base">iON CCTV</span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400 sm:block">Operations workspace</span>
            </span>
          </div>

          {/* Centre: desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center" aria-label="Main navigation">
            {visibleNavItems.map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                  isActive ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/10' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
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
                  {!isViewer && (
                    <>
                      <button onClick={() => { exportBackup(data); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                        <Download size={13} /> Download Backup
                      </button>
                      <label className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <Upload size={13} /> Restore Backup
                        <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                      </label>
                    </>
                  )}
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
            {visibleNavItems.map(item => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
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

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-7 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
