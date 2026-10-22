import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, Modal } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/FormFields';
import { useAuth } from '../../context/AuthContext';
import type {
  ApprovalEvent,
  ApprovalStage,
  ApprovalStatus,
  BlanketApproval,
  InstallationRecord,
  QuoteRevision,
} from '../../types';
import { AlertCircle, Check, ChevronRight, CornerUpLeft, FileText, Layers3, Users } from 'lucide-react';

const stageTitle: Record<ApprovalStage, string> = {
  surveillance_head: 'Surveillance Head',
  enablement_head: 'Head of Enablement',
};

const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (date: string) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function getLatestRevision(revisions: QuoteRevision[], recordId: string) {
  const sorted = revisions
    .filter(revision => revision.installationRecordId === recordId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted[sorted.length - 1];
}

function getCandidateCount(record: InstallationRecord, revisions: QuoteRevision[], examDates: Array<{ installationRecordId: string; scheduledCandidates: number }>) {
  const latest = getLatestRevision(revisions, record.id);
  return latest?.totalCandidates ??
    examDates.filter(date => date.installationRecordId === record.id).reduce((total, date) => total + date.scheduledCandidates, 0);
}

function getRevisionHistory(revisions: QuoteRevision[], recordId: string) {
  return revisions
    .filter(revision => revision.installationRecordId === recordId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ApprovalsPage() {
  const { data, updateData, addAuditLog, currentUser, can } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [tcCodeFilter, setTcCodeFilter] = useState('');
  const [remarks, setRemarks] = useState('');
  const [exceptionApproval, setExceptionApproval] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [blanketModalOpen, setBlanketModalOpen] = useState(false);
  const [blanketRemarks, setBlanketRemarks] = useState('');

  const allowedStages: ApprovalStage[] = [
    ...(can('approve_surveillance') ? ['surveillance_head' as const] : []),
    ...(can('approve_enablement') ? ['enablement_head' as const] : []),
  ];
  const queue = data.installations
    .filter(record => (record.approvalStatus || 'pending') === 'pending' &&
      allowedStages.includes(record.approvalStage || 'surveillance_head'))
    .map(record => record.approvalStage ? record : { ...record, approvalStage: 'surveillance_head' as const })
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const filteredQueue = queue.filter(record => {
    const requirement = data.requirements.find(item => item.id === record.requirementId);
    return !tcCodeFilter || requirement?.tcCode.toLowerCase().includes(tcCodeFilter.trim().toLowerCase());
  });
  const selectedRecord = filteredQueue.find(record => record.id === selectedId) || filteredQueue[0];
  const selectedRequirement = selectedRecord
    ? data.requirements.find(requirement => requirement.id === selectedRecord.requirementId)
    : undefined;
  const revisionHistory = selectedRecord ? getRevisionHistory(data.quoteRevisions, selectedRecord.id) : [];
  const currentRevision = revisionHistory[revisionHistory.length - 1];
  const previousRevision = revisionHistory.length > 1 ? revisionHistory[revisionHistory.length - 2] : undefined;
  const vendor = selectedRecord ? data.vendors.find(item => item.id === selectedRecord.vendorId) : undefined;
  const candidateCount = selectedRecord
    ? getCandidateCount(selectedRecord, data.quoteRevisions, data.examDates)
    : 0;
  const costPerCandidate = candidateCount > 0 && selectedRecord ? selectedRecord.localVendorCost / candidateCount : 0;

  const projectVenues = useMemo(() => {
    if (!selectedRecord || !selectedRequirement) return [];
    return data.installations.flatMap(record => {
      const requirement = data.requirements.find(item => item.id === record.requirementId);
      if (!requirement || requirement.clientName !== selectedRequirement.clientName ||
        requirement.examName !== selectedRequirement.examName) return [];
      const candidates = getCandidateCount(record, data.quoteRevisions, data.examDates);
      return [{
        record,
        requirement,
        cost: record.localVendorCost,
        candidates,
        perCandidate: candidates > 0 ? record.localVendorCost / candidates : 0,
      }];
    });
  }, [data.installations, data.requirements, data.quoteRevisions, data.examDates, selectedRecord, selectedRequirement]);

  const otherProjectVenues = projectVenues.filter(item => item.record.id !== selectedRecord?.id);
  const averageProjectPerCandidate = otherProjectVenues.length > 0
    ? otherProjectVenues.reduce((total, item) => total + item.perCandidate, 0) /
      Math.max(1, otherProjectVenues.filter(item => item.candidates > 0).length)
    : 0;
  const isHighestTotal = projectVenues.length > 1 &&
    selectedRecord?.localVendorCost === Math.max(...projectVenues.map(item => item.cost));
  const comparablePerCandidate = projectVenues.filter(item => item.candidates > 0);
  const isHighestPerCandidate = comparablePerCandidate.length > 1 &&
    costPerCandidate === Math.max(...comparablePerCandidate.map(item => item.perCandidate));
  const historicalInstallations = selectedRequirement
    ? data.installations
      .filter(record => record.id !== selectedRecord?.id)
      .filter(record => {
        const requirement = data.requirements.find(item => item.id === record.requirementId);
        return requirement?.clientName === selectedRequirement.clientName &&
          requirement.tcCode.toLowerCase() === selectedRequirement.tcCode.toLowerCase();
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];
  const lastInstallation = historicalInstallations[0];
  const lastInstallationVendor = lastInstallation ? data.vendors.find(item => item.id === lastInstallation.vendorId) : undefined;
  const vendorReuse = selectedRecord
    ? data.installations.flatMap(record => {
      if (record.id === selectedRecord.id || record.vendorId !== selectedRecord.vendorId) return [];
      const requirement = data.requirements.find(item => item.id === record.requirementId);
      return requirement ? [{ record, requirement }] : [];
    })
    : [];
  const increaseFromPrevious = previousRevision && previousRevision.localVendorCost > 0
    ? (selectedRecord!.localVendorCost - previousRevision.localVendorCost) / previousRevision.localVendorCost
    : undefined;
  const costOutlier = averageProjectPerCandidate > 0 &&
    costPerCandidate > averageProjectPerCandidate * 1.25;
  const revisionChanges = previousRevision && currentRevision && selectedRecord ? [
    {
      label: 'Total quote',
      before: money(previousRevision.localVendorCost),
      after: money(currentRevision.localVendorCost),
      changed: previousRevision.localVendorCost !== currentRevision.localVendorCost,
    },
    {
      label: 'Cost per candidate',
      before: previousRevision.totalCandidates > 0
        ? money(previousRevision.localVendorCost / previousRevision.totalCandidates)
        : 'Unavailable',
      after: currentRevision.totalCandidates > 0
        ? money(currentRevision.localVendorCost / currentRevision.totalCandidates)
        : 'Unavailable',
      changed: previousRevision.totalCandidates > 0 && currentRevision.totalCandidates > 0
        ? previousRevision.localVendorCost / previousRevision.totalCandidates !==
          currentRevision.localVendorCost / currentRevision.totalCandidates
        : previousRevision.totalCandidates !== currentRevision.totalCandidates,
    },
    {
      label: 'Vendor',
      before: data.vendors.find(item => item.id === previousRevision.vendorId)?.vendorName || 'Unavailable',
      after: data.vendors.find(item => item.id === currentRevision.vendorId)?.vendorName || 'Unavailable',
      changed: previousRevision.vendorId !== currentRevision.vendorId,
    },
    {
      label: 'Candidates',
      before: previousRevision.totalCandidates.toLocaleString('en-IN'),
      after: currentRevision.totalCandidates.toLocaleString('en-IN'),
      changed: previousRevision.totalCandidates !== currentRevision.totalCandidates,
    },
    {
      label: 'Installation type / cameras',
      before: `${previousRevision.installationType} / ${previousRevision.cameraCount}`,
      after: `${currentRevision.installationType} / ${currentRevision.cameraCount}`,
      changed: previousRevision.installationType !== currentRevision.installationType ||
        previousRevision.cameraCount !== currentRevision.cameraCount,
    },
    {
      label: 'Exam schedule',
      before: previousRevision.examDates
        .map(item => `${item.examDate}: ${item.scheduledCandidates}`)
        .sort().join(', ') || 'No schedule',
      after: currentRevision.examDates
        .map(item => `${item.examDate}: ${item.scheduledCandidates}`)
        .sort().join(', ') || 'No schedule',
      changed: JSON.stringify(previousRevision.examDates.slice().sort((a, b) => a.examDate.localeCompare(b.examDate))) !==
        JSON.stringify(currentRevision.examDates.slice().sort((a, b) => a.examDate.localeCompare(b.examDate))),
    },
    {
      label: 'Quotation PDF',
      before: data.quotations.find(item => item.id === previousRevision.quotationFileId)?.originalFileName || 'No file',
      after: data.quotations.find(item => item.id === currentRevision.quotationFileId)?.originalFileName || 'No file',
      changed: previousRevision.quotationFileId !== currentRevision.quotationFileId,
    },
  ].filter(change => change.changed) : [];
  const riskFlags = [
    increaseFromPrevious !== undefined && increaseFromPrevious > 0.2
      ? `Quote is ${Math.round(increaseFromPrevious * 100)}% higher than the previous quote for this venue.`
      : undefined,
    costOutlier
      ? `Per-candidate cost is more than 25% above the other venues in this exam project (${money(averageProjectPerCandidate)} average).`
      : undefined,
  ].filter((flag): flag is string => Boolean(flag));
  const currentStage = selectedRecord?.approvalStage || (selectedRecord?.approvalStatus !== 'approved' ? 'surveillance_head' : undefined);
  const isAllowedToAct = !!currentStage && (
    (currentStage === 'surveillance_head' && can('approve_surveillance')) ||
    (currentStage === 'enablement_head' && can('approve_enablement'))
  );
  const sameStageProjectPending = selectedRecord && selectedRequirement
    ? queue.filter(record => {
      const requirement = data.requirements.find(item => item.id === record.requirementId);
      return record.approvalStage === currentStage &&
        requirement?.clientName === selectedRequirement.clientName &&
        requirement.examName === selectedRequirement.examName;
    })
    : [];
  const returnedCount = data.installations.filter(record => record.approvalStatus === 'returned').length;
  const approvedCount = data.installations.filter(record => record.approvalStatus === 'approved').length;
  const selectedEvents = selectedRecord
    ? data.approvalEvents
      .filter(event => event.installationRecordId === selectedRecord.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  const handleDecision = (action: 'approved' | 'sent_back') => {
    if (!selectedRecord || !currentStage || !isAllowedToAct) return;
    const note = remarks.trim();
    if (action === 'sent_back' && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when sending a quote back.' });
      return;
    }
    if (action === 'approved' && (riskFlags.length > 0 || exceptionApproval) && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory for an abnormal or exception approval.' });
      return;
    }
    if (!currentRevision) {
      setAlert({ type: 'error', message: 'This quote has no saved revision snapshot and cannot be approved.' });
      return;
    }
    const event: ApprovalEvent = {
      id: uuidv4(),
      installationRecordId: selectedRecord.id,
      stage: currentStage,
      action,
      userId: currentUser!.id,
      remarks: note,
      exception: action === 'approved' ? exceptionApproval : undefined,
      quoteRevisionId: currentRevision.id,
      createdAt: new Date().toISOString(),
    };
    const nextStage = currentStage === 'surveillance_head' ? 'enablement_head' : undefined;
    const nextStatus: ApprovalStatus = action === 'sent_back'
      ? 'returned'
      : nextStage ? 'pending' : 'approved';
    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record => record.id === selectedRecord.id
        ? { ...record, approvalStatus: nextStatus, approvalStage: action === 'sent_back' ? currentStage : nextStage, updatedAt: event.createdAt }
        : record),
      approvalEvents: [...previous.approvalEvents, event],
    }));
    addAuditLog('UPDATE', 'InstallationApproval', selectedRecord.id, undefined, event);
    setAlert({
      type: 'success',
      message: action === 'sent_back'
        ? `Quote sent back to ${selectedRequirement?.zone || 'the zonal user'}.`
        : nextStage
          ? `Approved by ${stageTitle[currentStage]}; forwarded to ${stageTitle[nextStage]}.`
          : 'Quote approved by both levels.',
    });
    setRemarks('');
    setExceptionApproval(false);
    setSelectedId('');
  };

  const handleBlanketApproval = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = blanketRemarks.trim();
    if (!selectedRecord || !selectedRequirement || !currentStage || !isAllowedToAct) return;
    if (!note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory for a blanket approval.' });
      return;
    }
    const pendingInProject = sameStageProjectPending;
    const recordsMissingSnapshots = pendingInProject.filter(record =>
      !getLatestRevision(data.quoteRevisions, record.id)
    );
    if (recordsMissingSnapshots.length > 0) {
      setAlert({ type: 'error', message: 'One or more quotes are missing a revision snapshot. Review them individually before using blanket approval.' });
      return;
    }
    const createdAt = new Date().toISOString();
    const blanket: BlanketApproval = {
      id: uuidv4(),
      clientName: selectedRequirement.clientName,
      examName: selectedRequirement.examName,
      stage: currentStage,
      userId: currentUser!.id,
      remarks: note,
      installationRecordIds: pendingInProject.map(record => record.id),
      createdAt,
    };
    const events: ApprovalEvent[] = pendingInProject.map(record => ({
      id: uuidv4(),
      installationRecordId: record.id,
      stage: currentStage,
      action: 'approved',
      userId: currentUser!.id,
      remarks: note,
      quoteRevisionId: getLatestRevision(data.quoteRevisions, record.id)!.id,
      createdAt,
    }));
    const nextStage = currentStage === 'surveillance_head' ? 'enablement_head' : undefined;
    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record => pendingInProject.some(item => item.id === record.id)
        ? {
            ...record,
            approvalStatus: nextStage ? 'pending' : 'approved',
            approvalStage: nextStage,
            updatedAt: createdAt,
          }
        : record),
      approvalEvents: [...previous.approvalEvents, ...events],
      blanketApprovals: [...previous.blanketApprovals, blanket],
    }));
    addAuditLog('UPDATE', 'BlanketApproval', blanket.id, undefined, blanket);
    setBlanketModalOpen(false);
    setBlanketRemarks('');
    setSelectedId('');
    setAlert({
      type: 'success',
      message: `${pendingInProject.length} ${pendingInProject.length === 1 ? 'venue' : 'venues'} blanket-approved by ${stageTitle[currentStage]}${nextStage ? ` and forwarded to ${stageTitle[nextStage]}` : ''}.`,
    });
  };

  const openQuotation = (quotationFileId?: string) => {
    if (!quotationFileId) return;
    const quote = data.quotations.find(item => item.id === quotationFileId);
    if (!quote) {
      setAlert({ type: 'error', message: 'The quotation file attached to this revision is missing.' });
      return;
    }
    const windowRef = window.open();
    if (!windowRef) {
      setAlert({ type: 'error', message: 'Your browser blocked the quotation window. Allow pop-ups and try again.' });
      return;
    }
    windowRef.document.write(`<iframe src="${quote.dataUrl}" title="Quotation PDF" width="100%" height="100%" style="border:0"></iframe>`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Quote review workflow</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approvals</h1>
          <p className="mt-1 text-sm text-slate-500">Compare current and past costs, vendor history, and per-candidate pricing before approving.</p>
        </div>
        {selectedRecord && isAllowedToAct && sameStageProjectPending.length > 0 && (
          <Button variant="outline" onClick={() => setBlanketModalOpen(true)}>
            <Layers3 size={15} /> Blanket approve exam project ({sameStageProjectPending.length})
          </Button>
        )}
      </div>

      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Awaiting your review', queue.length, 'bg-blue-50 text-blue-700'],
          ['Surveillance Head', data.installations.filter(item => (item.approvalStatus || 'pending') === 'pending' && (item.approvalStage || 'surveillance_head') === 'surveillance_head').length, 'bg-indigo-50 text-indigo-700'],
          ['Head of Enablement', data.installations.filter(item => item.approvalStatus === 'pending' && item.approvalStage === 'enablement_head').length, 'bg-violet-50 text-violet-700'],
          ['Sent back to zone', returnedCount, 'bg-amber-50 text-amber-800'],
          ['Fully approved', approvedCount, 'bg-emerald-50 text-emerald-700'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {queue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Check className="mx-auto mb-3 text-emerald-600" size={30} />
          <h2 className="font-semibold text-slate-800">No quotes waiting for your review</h2>
          <p className="mt-1 text-sm text-slate-500">New submissions and resubmitted quotes will appear here at the appropriate approval level.</p>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-800">Review queue</h2>
              <p className="text-xs text-slate-500">{queue.length} quote{queue.length === 1 ? '' : 's'} at your level</p>
              <Input label="Filter by TC Code" value={tcCodeFilter} onChange={event => setTcCodeFilter(event.target.value)}
                placeholder="Enter TC Code" className="mt-2" />
            </div>
            <div className="max-h-[680px] overflow-y-auto">
              {filteredQueue.map(record => {
                const requirement = data.requirements.find(item => item.id === record.requirementId);
                const recordVendor = data.vendors.find(item => item.id === record.vendorId);
                const count = getCandidateCount(record, data.quoteRevisions, data.examDates);
                const active = (selectedRecord?.id || selectedId) === record.id;
                return (
                  <button key={record.id} onClick={() => { setSelectedId(record.id); setRemarks(''); setAlert(null); }}
                    className={`w-full border-b border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 ${active ? 'bg-blue-50/70 ring-inset ring-2 ring-blue-500' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{requirement?.tcName || 'Unknown venue'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{requirement?.tcCode} · {requirement?.zone}</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">
                        {stageTitle[record.approvalStage || 'surveillance_head']}
                      </span>
                      <span className="font-semibold text-slate-800">{money(record.localVendorCost)}</span>
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">{recordVendor?.vendorName || 'Vendor unavailable'} · {count.toLocaleString('en-IN')} candidates</p>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedRecord && selectedRequirement && currentStage && (
            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedRequirement.clientName} · {selectedRequirement.examName}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedRequirement.tcName}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedRequirement.tcCode} · {selectedRequirement.city}, {selectedRequirement.state} · {selectedRequirement.zone}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3 text-right">
                    <p className="text-xs font-medium text-blue-700">Current approval stage</p>
                    <p className="mt-0.5 font-semibold text-blue-950">{stageTitle[currentStage]}</p>
                  </div>
                </div>

                {riskFlags.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {riskFlags.map(flag => (
                      <div key={flag} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <AlertCircle className="mt-0.5 shrink-0" size={16} /> {flag}
                      </div>
                    ))}
                    <p className="text-xs text-amber-800">Approval requires written remarks for these cost exceptions.</p>
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Current quote', money(selectedRecord.localVendorCost)],
                    ['Per candidate', candidateCount > 0 ? money(costPerCandidate) : 'Candidate count unavailable'],
                    ['Total candidates', candidateCount.toLocaleString('en-IN')],
                    ['Vendor', vendor?.vendorName || 'Not found'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isHighestTotal && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">Highest total venue cost in project</span>}
                  {isHighestPerCandidate && <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">Highest cost per candidate in project</span>}
                  {currentRevision?.quotationFileId && (
                    <Button variant="outline" size="sm" onClick={() => openQuotation(currentRevision.quotationFileId)}>
                      <FileText size={14} /> View current quotation
                    </Button>
                  )}
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Past cost at this venue</h3>
                  {previousRevision ? (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500">Previous quote · {dateLabel(previousRevision.createdAt)}</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">{money(previousRevision.localVendorCost)}</p>
                        </div>
                        {previousRevision.quotationFileId && (
                          <Button variant="outline" size="sm" onClick={() => openQuotation(previousRevision.quotationFileId)}>View past quote</Button>
                        )}
                      </div>
                      <p className={`mt-2 text-sm font-medium ${increaseFromPrevious && increaseFromPrevious > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {increaseFromPrevious === undefined ? 'No comparable amount available' : `${increaseFromPrevious > 0 ? '+' : ''}${(increaseFromPrevious * 100).toFixed(1)}% vs previous quote`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Change in total quote: {selectedRecord.localVendorCost - previousRevision.localVendorCost > 0 ? '+' : ''}
                        {money(selectedRecord.localVendorCost - previousRevision.localVendorCost)}
                      </p>
                      {previousRevision.remarks && <p className="mt-2 text-xs text-slate-600">Previous note: {previousRevision.remarks}</p>}
                    </div>
                  ) : lastInstallation ? (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Last installation · {dateLabel(lastInstallation.updatedAt)}</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{money(lastInstallation.localVendorCost)}</p>
                      <p className="mt-1 text-sm text-slate-600">{lastInstallationVendor?.vendorName || 'Vendor unavailable'}</p>
                      <p className="mt-2 text-xs text-slate-500">Previous quote file and revision history are unavailable for this legacy record.</p>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No previous installation or quotation is recorded for this venue.</p>
                  )}
                  {previousRevision && lastInstallation && (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Last separate installation · {dateLabel(lastInstallation.updatedAt)}</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{money(lastInstallation.localVendorCost)}</p>
                      <p className="mt-1 text-sm text-slate-600">{lastInstallationVendor?.vendorName || 'Vendor unavailable'}</p>
                    </div>
                  )}
                  {previousRevision && currentRevision && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What changed in the latest quote</p>
                      {revisionChanges.length > 0 ? (
                        <ul className="space-y-2">
                          {revisionChanges.map(change => (
                            <li key={change.label} className="grid grid-cols-[125px_minmax(0,1fr)] gap-2 text-xs">
                              <span className="font-medium text-slate-600">{change.label}</span>
                              <span className="text-slate-700">{change.before} <span className="px-1 text-slate-400">→</span> <strong>{change.after}</strong></span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-600">No quote fields changed in this revision.</p>
                      )}
                      <p className="mt-3 text-xs font-medium text-slate-500">Zonal user resubmission remarks</p>
                      <p className="mt-1 text-sm text-slate-700">{currentRevision.remarks || 'No resubmission note saved.'}</p>
                    </div>
                  )}
                  {revisionHistory.length > 1 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quote revision history</p>
                      <ol className="space-y-2">
                        {revisionHistory.slice().reverse().map((revision, index) => (
                          <li key={revision.id} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-slate-600">{index === 0 ? 'Current' : `Revision ${revisionHistory.length - index}`} · {dateLabel(revision.createdAt)}</span>
                            <span className="font-semibold text-slate-800">{money(revision.localVendorCost)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-slate-900">Vendor use at other locations</h3>
                  {vendorReuse.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {vendorReuse.slice(0, 5).map(({ record, requirement }) => (
                        <div key={record.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                          <div>
                            <p className="font-medium text-slate-800">{requirement.tcName}</p>
                            <p className="text-xs text-slate-500">{requirement.tcCode} · {requirement.city}, {requirement.zone}</p>
                          </div>
                          <span className="shrink-0 font-semibold text-slate-800">{money(record.localVendorCost)}</span>
                        </div>
                      ))}
                      {vendorReuse.length > 5 && <p className="text-xs text-slate-500">And {vendorReuse.length - 5} more location(s).</p>}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No other recorded installation uses this vendor.</p>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="font-semibold text-slate-900">Exam project cost comparison</h3>
                  <p className="mt-1 text-xs text-slate-500">Highest total cost and highest per-candidate cost are highlighted across this client and exam.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Venue</th>
                        <th className="px-4 py-3">Zone</th>
                        <th className="px-4 py-3 text-right">Candidates</th>
                        <th className="px-4 py-3 text-right">Total cost</th>
                        <th className="px-4 py-3 text-right">Cost / candidate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectVenues.slice().sort((a, b) => b.cost - a.cost).map(item => {
                        const rowHighestTotal = item.cost === Math.max(...projectVenues.map(venue => venue.cost));
                        const candidatesWithCost = projectVenues.filter(venue => venue.candidates > 0);
                        const rowHighestPerCandidate = item.candidates > 0 &&
                          item.perCandidate === Math.max(...candidatesWithCost.map(venue => venue.perCandidate));
                        return (
                          <tr key={item.record.id} className={`border-t border-slate-100 ${item.record.id === selectedRecord.id ? 'bg-blue-50/60' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800">{item.requirement.tcName}</p>
                              <p className="text-xs text-slate-500">{item.requirement.tcCode}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{item.requirement.zone}</td>
                            <td className="px-4 py-3 text-right">{item.candidates.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-medium">
                              {money(item.cost)} {rowHighestTotal && <span className="ml-1 text-[10px] font-semibold text-rose-700">HIGHEST</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {item.candidates > 0 ? money(item.perCandidate) : '—'}
                              {rowHighestPerCandidate && <span className="ml-1 text-[10px] font-semibold text-orange-700">HIGHEST</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {projectVenues.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No comparable project costs are available.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">Decision and remarks</h3>
                  <p className="mt-1 text-xs text-slate-500">Send-back remarks are always mandatory. Approval remarks are mandatory when a cost alert is raised or an exception is selected.</p>
                </div>
                <div className="space-y-4">
                  <Textarea label="Remarks" value={remarks} onChange={event => setRemarks(event.target.value)} rows={3}
                    placeholder="Record the reason for approval or the corrections required from the zonal user." />
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={exceptionApproval} onChange={event => setExceptionApproval(event.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span><strong>Exception approval</strong><span className="block text-xs text-slate-500">Requires written remarks and is retained in the approval trail.</span></span>
                  </label>
                  {!isAllowedToAct && <p className="text-sm text-amber-700">Your role cannot approve this stage.</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={!isAllowedToAct} onClick={() => handleDecision('sent_back')}>
                      <CornerUpLeft size={14} /> Send back to zone
                    </Button>
                    <Button disabled={!isAllowedToAct} onClick={() => handleDecision('approved')}>
                      <Check size={14} /> {currentStage === 'surveillance_head' ? 'Approve and forward' : 'Approve final'}
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Approval trail</h3>
                {selectedEvents.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No decisions recorded yet.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {selectedEvents.map(event => {
                      const approver = data.users.find(user => user.id === event.userId);
                      const revision = data.quoteRevisions.find(item => item.id === event.quoteRevisionId);
                      return (
                        <li key={event.id} className="flex gap-3 border-l-2 border-blue-200 pl-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800">
                              {stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'}
                              {event.exception && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">Exception</span>}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">{approver?.name || 'Former user'} · {dateLabel(event.createdAt)} · quote {revision ? money(revision.localVendorCost) : 'revision unavailable'}</p>
                            {event.remarks && <p className="mt-1 text-sm text-slate-700">{event.remarks}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {data.blanketApprovals.filter(item => item.installationRecordIds.includes(selectedRecord.id)).map(item => (
                  <p key={item.id} className="mt-3 flex gap-2 text-xs text-slate-600">
                    <Users size={14} /> Blanket approval for {item.clientName} · {item.examName}: {item.remarks}
                  </p>
                ))}
              </section>
            </div>
          )}
        </div>
      )}

      <Modal open={blanketModalOpen} onClose={() => setBlanketModalOpen(false)} title="Blanket approval for exam project">
        <form onSubmit={handleBlanketApproval} className="space-y-4">
          <p className="text-sm text-slate-600">
            This will approve {sameStageProjectPending.length} pending quote{sameStageProjectPending.length === 1 ? '' : 's'} for
            {' '}{selectedRequirement?.clientName} · {selectedRequirement?.examName} at the {currentStage ? stageTitle[currentStage] : 'current'} stage.
            All remarks will be attached to each quote's approval trail.
          </p>
          <Textarea label="Blanket approval remarks (required)" value={blanketRemarks}
            onChange={event => setBlanketRemarks(event.target.value)} rows={4} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBlanketModalOpen(false)}>Cancel</Button>
            <Button type="submit"><Layers3 size={14} /> Confirm blanket approval</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
