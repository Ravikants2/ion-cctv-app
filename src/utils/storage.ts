import { v4 as uuidv4 } from 'uuid';
import type { AppData, User } from '../types';

// ─── GitHub API config (set via .env / GitHub Actions secrets) ───────────────
const OWNER = import.meta.env.VITE_GITHUB_OWNER as string;
const REPO  = import.meta.env.VITE_GITHUB_DATA_BRANCH
  ? (import.meta.env.VITE_GITHUB_REPO as string)
  : '';
const BRANCH = (import.meta.env.VITE_GITHUB_DATA_BRANCH as string) || 'data';
const TOKEN  = import.meta.env.VITE_GITHUB_TOKEN as string;
const DATA_PATH = 'db.json';

const LOCAL_KEY  = 'ion_cctv_data';
const LOCAL_SHA  = 'ion_cctv_sha';

// ─── Password hashing (demo-safe deterministic hash) ─────────────────────────
export function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = (hash << 5) - hash + password.charCodeAt(i);
    hash |= 0;
  }
  return 'demo_' + Math.abs(hash).toString(16);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return hashPassword(plain) === hash;
}

// ─── Seed users ───────────────────────────────────────────────────────────────
const SEED_USERS: User[] = [
  { id: uuidv4(), name: 'Super Admin',  email: 'superadmin@ion.com', role: 'super_admin', passwordHash: hashPassword('Admin@123') },
  { id: uuidv4(), name: 'Sub Admin',    email: 'subadmin@ion.com',   role: 'sub_admin',   passwordHash: hashPassword('Sub@123')   },
  { id: uuidv4(), name: 'User One',     email: 'user@ion.com',       role: 'user',        passwordHash: hashPassword('User@123')  },
  { id: uuidv4(), name: 'Viewer',       email: 'viewer@ion.com',     role: 'viewer',      passwordHash: hashPassword('View@123')  },
];

export function getInitialData(): AppData {
  return {
    users: SEED_USERS,
    requirements: [],
    vendors: [],
    installations: [],
    examDates: [],
    quotations: [],
    quoteRevisions: [],
    approvalEvents: [],
    blanketApprovals: [],
    accessRoles: [],
    userGroups: [],
    auditLogs: [],
  };
}

export function normalizeAppData(data: Partial<AppData>): AppData {
  const initial = getInitialData();
  const userGroups = Array.isArray(data.userGroups) ? data.userGroups : [];
  const users = Array.isArray(data.users) && data.users.length > 0
    ? data.users.map(user => ({
        ...user,
        groupIds: [...new Set([
          ...(Array.isArray(user.groupIds) ? user.groupIds : []),
          ...userGroups.filter(group => group.userIds.includes(user.id)).map(group => group.id),
        ])],
      }))
    : initial.users;
  const installations = (Array.isArray(data.installations) ? data.installations : []).map(record => ({
    ...record,
    approvalStatus: record.approvalStatus || 'pending' as const,
    approvalStage: record.approvalStage || (record.approvalStatus === 'approved' ? undefined : 'surveillance_head' as const),
  }));
  return {
    ...initial,
    ...data,
    users,
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    vendors: Array.isArray(data.vendors) ? data.vendors : [],
    installations,
    examDates: Array.isArray(data.examDates) ? data.examDates : [],
    quotations: Array.isArray(data.quotations) ? data.quotations : [],
    quoteRevisions: Array.isArray(data.quoteRevisions) ? data.quoteRevisions : [],
    approvalEvents: Array.isArray(data.approvalEvents) ? data.approvalEvents : [],
    blanketApprovals: Array.isArray(data.blanketApprovals) ? data.blanketApprovals : [],
    accessRoles: Array.isArray(data.accessRoles) ? data.accessRoles : [],
    userGroups,
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
  };
}

// ─── Local cache helpers ──────────────────────────────────────────────────────
function readLocal(): AppData | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? normalizeAppData(JSON.parse(raw) as Partial<AppData>) : null;
  } catch { return null; }
}

function writeLocal(data: AppData): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────
function githubHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function apiUrl(): string {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`;
}

export function isGitHubConfigured(): boolean {
  return !!(OWNER && REPO && TOKEN && OWNER !== 'your-github-username');
}

/** Fetch data from GitHub data branch */
export async function loadFromGitHub(): Promise<AppData> {
  const res = await fetch(apiUrl(), { headers: githubHeaders() });
  if (res.status === 404) {
    // File doesn't exist yet — return initial data
    return getInitialData();
  }
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  const json = await res.json() as { content: string; sha: string };
  const sha = json.sha;
  const parsed = JSON.parse(atob(json.content.replace(/\n/g, ''))) as Partial<AppData>;
  const decoded = normalizeAppData(parsed);
  localStorage.setItem(LOCAL_SHA, sha);
  if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
    writeLocal(decoded);
    await saveToGitHub(decoded);
    return decoded;
  }
  writeLocal(decoded);
  return decoded;
}

/** Save data to GitHub data branch (creates or updates db.json) */
export async function saveToGitHub(data: AppData): Promise<void> {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const sha = localStorage.getItem(LOCAL_SHA) || undefined;

  const body: Record<string, unknown> = {
    message: `data: update ${new Date().toISOString()}`,
    content,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`,
    { method: 'PUT', headers: githubHeaders(), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(`GitHub save failed: ${err.message || res.status}`);
  }
  const result = await res.json() as { content: { sha: string } };
  localStorage.setItem(LOCAL_SHA, result.content.sha);
  writeLocal(data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load data: GitHub first, fall back to localStorage, then seed */
export async function loadData(): Promise<AppData> {
  if (isGitHubConfigured()) {
    try {
      return await loadFromGitHub();
    } catch {
      // GitHub unreachable — use local cache
      const local = readLocal();
      return local ?? getInitialData();
    }
  }
  const local = readLocal();
  if (!local) {
    const initial = getInitialData();
    writeLocal(initial);
    return initial;
  }
  return local;
}

/** Save data: always write local immediately, then push to GitHub async */
export function saveData(data: AppData, onError?: (e: Error) => void): void {
  writeLocal(data);
  if (isGitHubConfigured()) {
    saveToGitHub(data).catch(e => {
      console.error('GitHub sync failed:', e);
      onError?.(e as Error);
    });
  }
}

/** Download full backup as JSON file */
export function exportBackup(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ion-cctv-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Restore from a backup JSON file */
export function importBackup(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(normalizeAppData(JSON.parse(e.target?.result as string) as Partial<AppData>));
      } catch { reject(new Error('Invalid backup file')); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
