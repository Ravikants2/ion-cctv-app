import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { User, Role, AppData, AuditAction } from '../types';
import { loadData, saveData, verifyPassword, getInitialData, isGitHubConfigured } from '../utils/storage';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

interface AuthContextType {
  currentUser: User | null;
  data: AppData;
  syncStatus: SyncStatus;
  syncError: string;
  isGitHub: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  updateData: (updater: (prev: AppData) => AppData) => void;
  addAuditLog: (action: AuditAction, entityType: string, entityId: string, before?: unknown, after?: unknown) => void;
  can: (action: string) => boolean;
  reloadFromGitHub: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(getInitialData());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data on mount
  useEffect(() => {
    setSyncStatus('loading');
    loadData().then(loaded => {
      setData(loaded);
      setSyncStatus('idle');
      // Restore session
      const storedId = sessionStorage.getItem('ion_user');
      if (storedId) {
        const u = loaded.users.find(u => u.id === storedId);
        if (u) setCurrentUser(u);
      }
    }).catch(e => {
      setSyncStatus('error');
      setSyncError((e as Error).message);
    });
  }, []);

  const reloadFromGitHub = useCallback(async () => {
    setSyncStatus('loading');
    setSyncError('');
    try {
      const loaded = await loadData();
      setData(loaded);
      setSyncStatus('idle');
    } catch (e) {
      setSyncStatus('error');
      setSyncError((e as Error).message);
    }
  }, []);

  const updateData = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => {
      const next = updater(prev);
      // Debounce GitHub saves by 800ms to batch rapid updates
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSyncStatus('saving');
      saveTimer.current = setTimeout(() => {
        saveData(next, (err) => {
          setSyncStatus('error');
          setSyncError(err.message);
        });
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      }, 800);
      return next;
    });
  }, []);

  const addAuditLog = useCallback((
    action: AuditAction, entityType: string, entityId: string,
    before?: unknown, after?: unknown
  ) => {
    setData(prev => {
      const next = {
        ...prev,
        auditLogs: [...prev.auditLogs, {
          id: uuidv4(),
          userId: currentUser?.id || 'system',
          action, entityType, entityId,
          beforeJson: before ? JSON.stringify(before) : undefined,
          afterJson: after ? JSON.stringify(after) : undefined,
          timestamp: new Date().toISOString(),
        }],
      };
      return next;
    });
  }, [currentUser]);

  const login = useCallback((email: string, password: string): boolean => {
    const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) return false;
    setCurrentUser(user);
    sessionStorage.setItem('ion_user', user.id);
    addAuditLog('LOGIN', 'User', user.id);
    return true;
  }, [data.users, addAuditLog]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    sessionStorage.removeItem('ion_user');
  }, []);

  const can = useCallback((action: string): boolean => {
    if (!currentUser) return false;
    const role: Role = currentUser.role;
    const isAdmin = role === 'super_admin' || role === 'sub_admin';
    switch (action) {
      case 'delete_master':      return role === 'super_admin';
      case 'upload_master':      return role === 'super_admin' || role === 'sub_admin';
      case 'create_installation':return !['viewer', 'surveillance_head', 'enablement_head'].includes(role);
      case 'edit_installation':  return !['viewer', 'surveillance_head', 'enablement_head'].includes(role);
      case 'view_dashboard':     return true;
      case 'manage_users':       return role === 'super_admin';
      case 'view_approvals':     return isAdmin || role === 'surveillance_head' || role === 'enablement_head';
      case 'approve_surveillance': return isAdmin || role === 'surveillance_head';
      case 'approve_enablement':   return isAdmin || role === 'enablement_head';
      default: return false;
    }
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{
      currentUser, data, syncStatus, syncError,
      isGitHub: isGitHubConfigured(),
      login, logout, updateData, addAuditLog, can, reloadFromGitHub,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// The provider and its matching hook intentionally share this context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
