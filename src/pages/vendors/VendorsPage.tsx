import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, Badge, ConfirmDialog, Modal } from '../../components/ui/index';
import { downloadTemplate, parseVendorFile } from '../../utils/excel';
import type { VendorMaster } from '../../types';
import { Download, Upload, Trash2, Plus } from 'lucide-react';

export default function VendorsPage() {
  const { data, updateData, addAuditLog, can, currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [preview, setPreview] = useState<Array<Partial<VendorMaster> & { status: 'NEW' | 'UPDATE' | 'ERROR'; error?: string }> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState<{ zone: string; vendorName: string }>({ zone: '', vendorName: '' });
  const [formError, setFormError] = useState('');

  const zones = [...new Set(data.requirements.map(r => r.zone))].sort();

  const filtered = data.vendors.filter(v => {
    if (filterZone && v.zone !== filterZone) return false;
    if (search && !v.vendorName.toLowerCase().includes(search.toLowerCase()) && !v.zone.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseVendorFile(file);
      const previewRows = rows.map(row => {
        if (!row.zone || !row.vendorName) return { ...row, status: 'ERROR' as const, error: 'Missing fields' };
        const existing = data.vendors.find(v => v.zone === row.zone && v.vendorName === row.vendorName);
        return { ...row, id: existing?.id, status: existing ? 'UPDATE' as const : 'NEW' as const };
      });
      setPreview(previewRows);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to parse file.' });
    }
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    const valid = preview.filter(r => r.status !== 'ERROR');
    updateData(prev => {
      let vendors = [...prev.vendors];
      valid.forEach(row => {
        if (row.status === 'UPDATE' && row.id) {
          vendors = vendors.map(v => v.id === row.id ? { ...v, zone: row.zone!, vendorName: row.vendorName!, updatedAt: new Date().toISOString() } : v);
        } else {
          vendors.push({ id: uuidv4(), zone: row.zone!, vendorName: row.vendorName!, createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      });
      return { ...prev, vendors };
    });
    setAlert({ type: 'success', msg: `Imported ${valid.length} vendors.` });
    setPreview(null);
  };

  const handleDelete = (id: string) => {
    const inUse = data.installations.some(i => i.vendorId === id);
    if (inUse) { setAlert({ type: 'error', msg: 'Cannot delete: vendor is used in an installation record.' }); return; }
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const v = data.vendors.find(v => v.id === deleteId);
    updateData(prev => ({ ...prev, vendors: prev.vendors.filter(v => v.id !== deleteId) }));
    addAuditLog('DELETE', 'VendorMaster', deleteId, v, undefined);
    setDeleteId(null);
    setAlert({ type: 'success', msg: 'Vendor deleted.' });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.zone || !form.vendorName) { setFormError('All fields required.'); return; }
    const dup = data.vendors.find(v => v.zone === form.zone && v.vendorName === form.vendorName);
    if (dup) { setFormError('Duplicate: Zone + Vendor Name already exists.'); return; }
    const newV: VendorMaster = { id: uuidv4(), zone: form.zone, vendorName: form.vendorName, createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    updateData(prev => ({ ...prev, vendors: [...prev.vendors, newV] }));
    addAuditLog('CREATE', 'VendorMaster', newV.id, undefined, newV);
    setAddModal(false);
    setForm({ zone: '', vendorName: '' });
    setFormError('');
    setAlert({ type: 'success', msg: 'Vendor added.' });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Zone-wise Vendor Master</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('vendor')}><Download size={14} /> Template</Button>
          {can('upload_master') && (
            <label className="cursor-pointer">
              <Button variant="secondary" size="sm" as="span"><Upload size={14} /> Upload</Button>
              <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
            </label>
          )}
          {can('upload_master') && <Button size="sm" onClick={() => setAddModal(true)}><Plus size={14} /> Add</Button>}
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Search vendor…" value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
        <Select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          options={zones.map(z => ({ value: z, label: z }))} placeholder="All Zones" className="w-36" />
        {(filterZone || search) && <Button variant="ghost" size="sm" onClick={() => { setFilterZone(''); setSearch(''); }}>Clear</Button>}
      </div>

      {preview && (
        <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Import Preview</h2>
          <div className="flex gap-4 text-sm mb-3">
            <span>Total: {preview.length}</span>
            <span className="text-green-700">New: {preview.filter(r => r.status === 'NEW').length}</span>
            <span className="text-blue-700">Update: {preview.filter(r => r.status === 'UPDATE').length}</span>
            <span className="text-red-700">Errors: {preview.filter(r => r.status === 'ERROR').length}</span>
          </div>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50"><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Zone</th><th className="px-2 py-1 text-left">Vendor Name</th><th className="px-2 py-1 text-left">Error</th></tr></thead>
              <tbody>{preview.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1"><Badge variant={r.status === 'NEW' ? 'success' : r.status === 'UPDATE' ? 'info' : 'error'}>{r.status}</Badge></td>
                  <td className="px-2 py-1">{r.zone}</td><td className="px-2 py-1">{r.vendorName}</td>
                  <td className="px-2 py-1 text-red-600">{r.error}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={confirmImport} disabled={preview.every(r => r.status === 'ERROR')}>Confirm Import</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b">
            {['Zone','Vendor Name','Created At','Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No vendors found.</td></tr>
              : filtered.map(v => (
                <tr key={v.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">{v.zone}</td>
                  <td className="px-4 py-3">{v.vendorName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(v.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    {can('delete_master') && <Button variant="danger" size="sm" onClick={() => handleDelete(v.id)}><Trash2 size={12} /></Button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-gray-500 border-t">{filtered.length} of {data.vendors.length} vendors</div>
      </div>

      <ConfirmDialog open={!!deleteId} title="Delete Vendor" message="Delete this vendor? This cannot be undone."
        onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />

      <Modal open={addModal} onClose={() => { setAddModal(false); setFormError(''); }} title="Add Vendor">
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
          <Select label="Zone" value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
            options={zones.map(z => ({ value: z, label: z }))} placeholder="Select Zone" required />
          <Input label="Vendor Name" value={form.vendorName} onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))} required />
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" type="button" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
