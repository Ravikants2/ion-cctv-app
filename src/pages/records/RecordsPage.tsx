import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormFields';
import { exportRecordsToExcel } from '../../utils/excel';
import { printRecordsPDF } from '../../utils/pdf';
import { getInstallationStats, formatINR } from '../../utils/calculations';
import { Download, Printer, Eye, Pencil } from 'lucide-react';

export default function RecordsPage() {
  const { data, can } = useAuth();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [filterZone, setFilterZone] = useState('');

  const clients = [...new Set(data.requirements.map(r => r.clientName))].sort();
  const exams = [...new Set(data.requirements.filter(r => !filterClient || r.clientName === filterClient).map(r => r.examName))].sort();
  const zones = [...new Set(data.requirements.map(r => r.zone))].sort();

  const filtered = data.installations.filter(inst => {
    const req = data.requirements.find(r => r.id === inst.requirementId);
    if (!req) return false;
    if (filterClient && req.clientName !== filterClient) return false;
    if (filterExam && req.examName !== filterExam) return false;
    if (filterZone && req.zone !== filterZone) return false;
    if (startDate || endDate) {
      const dates = data.examDates.filter(d => d.installationRecordId === inst.id).map(d => d.examDate);
      if (dates.length === 0) return false;
      if (startDate && !dates.some(d => d >= startDate)) return false;
      if (endDate && !dates.some(d => d <= endDate)) return false;
    }
    return true;
  });

  const handleViewQuotation = (quotationFileId: string) => {
    const q = data.quotations.find(q => q.id === quotationFileId);
    if (!q) return;
    const win = window.open();
    if (win) win.document.write(`<iframe src="${q.dataUrl}" width="100%" height="100%" style="border:none"></iframe>`);
  };

  const filterLabel = [
    filterClient && `Client: ${filterClient}`,
    filterExam && `Exam: ${filterExam}`,
    filterZone && `Zone: ${filterZone}`,
    startDate && `From: ${startDate}`,
    endDate && `To: ${endDate}`,
  ].filter(Boolean).join(' | ');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Installation Records</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportRecordsToExcel(filtered, data.requirements, data.vendors, data.examDates)}>
            <Download size={14} /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => printRecordsPDF(filtered, data.requirements, data.vendors, data.examDates, filterLabel)}>
            <Printer size={14} /> PDF
          </Button>
          {can('create_installation') && (
            <Button size="sm" onClick={() => navigate('/installation/new')}>+ New Record</Button>
          )}
          {can('upload_master') && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/installation/bulk')}>Bulk Upload</Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input type="date" label="Start Date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
        <Input type="date" label="End Date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
        <Select label="Client" value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterExam(''); }}
          options={clients.map(c => ({ value: c, label: c }))} placeholder="All Clients" className="w-44" />
        <Select label="Exam" value={filterExam} onChange={e => setFilterExam(e.target.value)}
          options={exams.map(e => ({ value: e, label: e }))} placeholder="All Exams" className="w-44" />
        <Select label="Zone" value={filterZone} onChange={e => setFilterZone(e.target.value)}
          options={zones.map(z => ({ value: z, label: z }))} placeholder="All Zones" className="w-36" />
        {(filterClient || filterExam || filterZone || startDate || endDate) && (
          <Button variant="ghost" size="sm" className="self-end" onClick={() => { setFilterClient(''); setFilterExam(''); setFilterZone(''); setStartDate(''); setEndDate(''); }}>Clear</Button>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              {['S No','Zone','State','City','TC Code','TC Name','Exam Days','Candidates','Vendor','Cost (Excl. Tax)','Quotation','Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
            ) : filtered.map((inst, idx) => {
              const req = data.requirements.find(r => r.id === inst.requirementId);
              const vendor = data.vendors.find(v => v.id === inst.vendorId);
              const { examDays, totalCandidates } = getInstallationStats(inst, data.examDates);
              return (
                <tr key={inst.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-3 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-3">{req?.zone}</td>
                  <td className="px-3 py-3">{req?.state}</td>
                  <td className="px-3 py-3">{req?.city}</td>
                  <td className="px-3 py-3 font-mono text-xs">{req?.tcCode}</td>
                  <td className="px-3 py-3">{req?.tcName}</td>
                  <td className="px-3 py-3 text-center">{examDays}</td>
                  <td className="px-3 py-3 text-right">{totalCandidates.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3">{vendor?.vendorName}</td>
                  <td className="px-3 py-3 text-right font-medium">{formatINR(inst.localVendorCost)}</td>
                  <td className="px-3 py-3">
                    {inst.quotationFileId ? (
                      <Button variant="ghost" size="sm" onClick={() => handleViewQuotation(inst.quotationFileId!)}>
                        <Eye size={12} /> View
                      </Button>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/installation/edit/${inst.id}`)}>
                        <Pencil size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-gray-500 border-t">{filtered.length} of {data.installations.length} records</div>
      </div>
    </div>
  );
}
