import React, { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { Alert, Badge, ConfirmDialog, Modal } from '../../components/ui/index';
import { downloadTemplate, parseRequirementFile } from '../../utils/excel';
import type { RequirementMaster } from '../../types';
import { Download, Upload, Trash2, Plus } from 'lucide-react';
import { TablePagination } from '../../components/ui/TablePagination';

const PAGE_SIZE = 25;

interface PreviewRow extends Partial<RequirementMaster> {
  status: 'NEW' | 'UPDATE' | 'ERROR';
  error?: string;
}

export default function RequirementsPage() {
  const { data, updateData, addAuditLog, can, currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState<Partial<RequirementMaster>>({});
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);

  const clients = [...new Set(data.requirements.map(r => r.clientName))].sort();
  const exams = [...new Set(data.requirements.filter(r => !filterClient || r.clientName === filterClient).map(r => r.examName))].sort();

  const filtered = data.requirements.filter(r => {
    if (filterClient && r.clientName !== filterClient) return false;
    if (filterExam && r.examName !== filterExam) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.tcCode.toLowerCase().includes(s) || r.tcName.toLowerCase().includes(s) ||
        r.clientName.toLowerCase().includes(s) || r.examName.toLowerCase().includes(s) ||
        r.city.toLowerCase().includes(s) || r.zone.toLowerCase().includes(s);
    }
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseRequirementFile(file);
      const previewRows: PreviewRow[] = rows.map(row => {
        if (!row.zone || !row.state || !row.city || !row.tcCode || !row.tcName || !row.clientName || !row.examName) {
          return { ...row, status: 'ERROR', error: 'Missing required fields' };
        }
        const existing = data.requirements.find(r =>
          r.clientName === row.clientName && r.examName === row.examName && r.tcCode === row.tcCode
        );
        return { ...row, id: existing?.id, status: existing ? 'UPDATE' : 'NEW' };
      });
      setPreview(previewRows);
    } catch {
      setAlert({ type: 'error', msg: 'Failed to parse file. Please use the correct template.' });
    }
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!preview) return;
    const valid = preview.filter(r => r.status !== 'ERROR');
    updateData(prev => {
      let reqs = [...prev.requirements];
      valid.forEach(row => {
        if (row.status === 'UPDATE' && row.id) {
          reqs = reqs.map(r => r.id === row.id ? { ...r, ...row, updatedAt: new Date().toISOString() } as RequirementMaster : r);
        } else {
          const newReq: RequirementMaster = {
            id: uuidv4(), zone: row.zone!, state: row.state!, city: row.city!,
            tcCode: row.tcCode!, tcName: row.tcName!, clientName: row.clientName!, examName: row.examName!,
            createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          reqs.push(newReq);
          addAuditLog('IMPORT', 'RequirementMaster', newReq.id, undefined, newReq);
        }
      });
      return { ...prev, requirements: reqs };
    });
    setAlert({ type: 'success', msg: `Imported ${valid.length} records.` });
    setPreview(null);
  };

  const handleDelete = (id: string) => {
    const inUse = data.installations.some(i => i.requirementId === id);
    if (inUse) {
      setAlert({ type: 'error', msg: 'Cannot delete: requirement is referenced by an installation record.' });
      return;
    }
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const req = data.requirements.find(r => r.id === deleteId);
    updateData(prev => ({ ...prev, requirements: prev.requirements.filter(r => r.id !== deleteId) }));
    addAuditLog('DELETE', 'RequirementMaster', deleteId, req, undefined);
    setDeleteId(null);
    setAlert({ type: 'success', msg: 'Requirement deleted.' });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { zone, state, city, tcCode, tcName, clientName, examName } = form;
    if (!zone || !state || !city || !tcCode || !tcName || !clientName || !examName) {
      setFormError('All fields are required.');
      return;
    }
    const dup = data.requirements.find(r => r.clientName === clientName && r.examName === examName && r.tcCode === tcCode);
    if (dup) { setFormError('Duplicate: Client + Exam + TC Code already exists.'); return; }
    const newReq: RequirementMaster = {
      id: uuidv4(), zone, state, city, tcCode, tcName, clientName, examName,
      createdBy: currentUser!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    updateData(prev => ({ ...prev, requirements: [...prev.requirements, newReq] }));
    addAuditLog('CREATE', 'RequirementMaster', newReq.id, undefined, newReq);
    setAddModal(false);
    setForm({});
    setFormError('');
    setAlert({ type: 'success', msg: 'Requirement added.' });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Temp. CCTV Requirements</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('requirement')}>
            <Download size={14} /> Template
          </Button>
          {can('upload_master') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileUpload} />
            </>
          )}
          {can('upload_master') && (
            <Button size="sm" onClick={() => setAddModal(true)}><Plus size={14} /> Add</Button>
          )}
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert></div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-48" />
        <Select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterExam(''); setPage(1); }}
          options={clients.map(c => ({ value: c, label: c }))} placeholder="All Clients" className="w-44" />
        <Select value={filterExam} onChange={e => { setFilterExam(e.target.value); setPage(1); }}
          options={exams.map(e => ({ value: e, label: e }))} placeholder="All Exams" className="w-44" />
        {(filterClient || filterExam || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterClient(''); setFilterExam(''); setSearch(''); setPage(1); }}>Clear</Button>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Import Preview</h2>
          <div className="flex gap-4 text-sm mb-3">
            <span>Total: {preview.length}</span>
            <span className="text-green-700">New: {preview.filter(r => r.status === 'NEW').length}</span>
            <span className="text-blue-700">Update: {preview.filter(r => r.status === 'UPDATE').length}</span>
            <span className="text-red-700">Errors: {preview.filter(r => r.status === 'ERROR').length}</span>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50">{['Status','Zone','State','City','TC Code','TC Name','Client','Exam','Error'].map(h => <th key={h} className="px-2 py-1 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1"><Badge variant={r.status === 'NEW' ? 'success' : r.status === 'UPDATE' ? 'info' : 'error'}>{r.status}</Badge></td>
                    <td className="px-2 py-1">{r.zone}</td><td className="px-2 py-1">{r.state}</td>
                    <td className="px-2 py-1">{r.city}</td><td className="px-2 py-1">{r.tcCode}</td>
                    <td className="px-2 py-1">{r.tcName}</td><td className="px-2 py-1">{r.clientName}</td>
                    <td className="px-2 py-1">{r.examName}</td><td className="px-2 py-1 text-red-600">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={confirmImport} disabled={preview.every(r => r.status === 'ERROR')}>Confirm Import</Button>
            <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b">
            {['Client Name','Exam Name','Zone','State','City','TC Code','TC Name','Actions'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No requirements found.</td></tr>
            ) : pageRows.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{r.clientName}</td>
                <td className="px-4 py-3">{r.examName}</td>
                <td className="px-4 py-3">{r.zone}</td>
                <td className="px-4 py-3">{r.state}</td>
                <td className="px-4 py-3">{r.city}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.tcCode}</td>
                <td className="px-4 py-3">{r.tcName}</td>
                <td className="px-4 py-3">
                  {can('delete_master') && (
                    <Button variant="danger" size="sm" onClick={() => handleDelete(r.id)}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Requirement"
        message="Are you sure you want to delete this requirement? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Modal open={addModal} onClose={() => { setAddModal(false); setForm({}); setFormError(''); }} title="Add Requirement">
        <form onSubmit={handleAddSubmit} className="grid grid-cols-2 gap-3">
          {(['zone','state','city','tcCode','tcName','clientName','examName'] as const).map(field => (
            <Input key={field} label={field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              value={form[field] || ''} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} required />
          ))}
          {formError && <div className="col-span-2"><Alert type="error">{formError}</Alert></div>}
          <div className="col-span-2 flex gap-2 justify-end mt-2">
            <Button variant="secondary" type="button" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
