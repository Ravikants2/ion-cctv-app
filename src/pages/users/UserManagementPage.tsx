import type React from 'react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, ConfirmDialog, Modal } from '../../components/ui/index';
import { SortableTable } from '../../components/ui/SortableTable';
import { hashPassword } from '../../utils/storage';
import type { Role, User } from '../../types';
import { KeyRound, Plus, Trash2 } from 'lucide-react';

const roleOptions = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'sub_admin', label: 'Sub Admin' },
  { value: 'user', label: 'User' },
  { value: 'viewer', label: 'Viewer' },
];

export default function UserManagementPage() {
  const { data, updateData, addAuditLog, can, currentUser } = useAuth();
  const [modal, setModal] = useState<'create' | 'password' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'user' as Role, password: '' });
  const [newPassword, setNewPassword] = useState('');

  if (!can('manage_users')) {
    return <Alert type="error">Only a super admin can manage users.</Alert>;
  }

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
    setForm({ name: '', email: '', role: 'user', password: '' });
    setNewPassword('');
  };

  const createUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (name.length === 0 || email.length === 0 || form.password.length < 8) {
      setAlert({ type: 'error', message: 'Enter a name, valid email, and password with at least 8 characters.' });
      return;
    }
    if (data.users.some(user => user.email.toLowerCase() === email)) {
      setAlert({ type: 'error', message: 'A user with this email already exists.' });
      return;
    }

    const user: User = {
      id: uuidv4(),
      name,
      email,
      role: form.role,
      passwordHash: hashPassword(form.password),
    };
    updateData(previous => ({ ...previous, users: [...previous.users, user] }));
    addAuditLog('CREATE', 'User', user.id, undefined, { ...user, passwordHash: '[redacted]' });
    closeModal();
    setAlert({ type: 'success', message: 'User created.' });
  };

  const changePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser || newPassword.length < 8) {
      setAlert({ type: 'error', message: 'Password must contain at least 8 characters.' });
      return;
    }
    const updated = { ...selectedUser, passwordHash: hashPassword(newPassword) };
    updateData(previous => ({
      ...previous,
      users: previous.users.map(user => user.id === updated.id ? updated : user),
    }));
    addAuditLog('UPDATE', 'User', updated.id, { passwordHash: '[redacted]' }, { passwordHash: '[changed]' });
    closeModal();
    setAlert({ type: 'success', message: `Password updated for ${selectedUser.name}.` });
  };

  const confirmDelete = () => {
    if (!deleteUser) return;
    const remainingAdmins = data.users.filter(user => user.role === 'super_admin' && user.id !== deleteUser.id);
    if (deleteUser.id === currentUser?.id || remainingAdmins.length === 0) {
      setAlert({ type: 'error', message: 'You cannot delete your own account or the last super admin.' });
      setDeleteUser(null);
      return;
    }
    updateData(previous => ({ ...previous, users: previous.users.filter(user => user.id !== deleteUser.id) }));
    addAuditLog('DELETE', 'User', deleteUser.id, { ...deleteUser, passwordHash: '[redacted]' }, undefined);
    setAlert({ type: 'success', message: `Deleted ${deleteUser.name}.` });
    setDeleteUser(null);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Access control</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create accounts, change passwords, and remove access.</p>
        </div>
        <Button onClick={() => { setAlert(null); setModal('create'); }}><Plus size={14} /> Create User</Button>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert></div>}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <SortableTable className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">
            {['Name', 'Email', 'Role', 'Actions'].map(label => (
              <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">{label}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.users.map(user => (
              <tr key={user.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3 capitalize">{user.role.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setAlert(null); setSelectedUser(user); setModal('password'); }}>
                      <KeyRound size={13} /> Change password
                    </Button>
                    <Button variant="danger" size="sm" disabled={user.id === currentUser?.id}
                      onClick={() => setDeleteUser(user)} aria-label={`Delete ${user.name}`}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <Modal open={modal === 'create'} onClose={closeModal} title="Create User">
        <form onSubmit={createUser} className="flex flex-col gap-3">
          <Input label="Full name" value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} required />
          <Select label="Role" value={form.role} options={roleOptions}
            onChange={event => setForm(previous => ({ ...previous, role: event.target.value as Role }))} />
          <Input label="Temporary password" type="password" minLength={8} value={form.password}
            onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Create User</Button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'password'} onClose={closeModal} title={`Change password${selectedUser ? ` — ${selectedUser.name}` : ''}`}>
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <Input label="New password" type="password" minLength={8} value={newPassword}
            onChange={event => setNewPassword(event.target.value)} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit">Update Password</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteUser} title="Delete User"
        message={deleteUser ? `Delete access for ${deleteUser.name}?` : ''}
        onConfirm={confirmDelete} onCancel={() => setDeleteUser(null)} />
    </div>
  );
}
