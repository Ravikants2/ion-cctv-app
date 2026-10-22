import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, Modal } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
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

function getCostRiskFlags(
  record: InstallationRecord,
  requirements: ReturnType<typeof useAuth>['data']['requirements'],
  installations: InstallationRecord[],
  revisions: QuoteRevision[],
  examDates: Array<{ installationRecordId: string; scheduledCandidates: number }>
) {
  const requirement = requirements.find(item => item.id === record.requirementId);
  if (!requirement) return [];
  const history = getRevisionHistory(revisions, record.id);
  const previous = history.length > 1 ? history[history.length - 2] : undefined;
  const increase = previous && previous.localVendorCost > 0
    ? (record.localVendorCost - previous.localVendorCost) / previous.localVendorCost
    : undefined;
  const candidates = getCandidateCount(record, revisions, examDates);
  const peerCosts = installations.flatMap(peer => {
    if (peer.id === record.id) return [];
    const peerRequirement = requirements.find(item => item.id === peer.requirementId);
    if (peerRequirement?.clientName !== requirement.clientName ||
      peerRequirement.examName !== requirement.examName) return [];
    const peerCandidates = getCandidateCount(peer, revisions, examDates);
    return peerCandidates > 0 ? [peer.localVendorCost / peerCandidates] : [];
  });
  const averagePeerCost = peerCosts.length > 0
    ? peerCosts.reduce((total, cost) => total + cost, 0) / peerCosts.length
    : 0;
  const perCandidate = candidates > 0 ? record.localVendorCost / candidates : 0;
  return [
    increase !== undefined && increase > 0.2
      ? `Quote is ${Math.round(increase * 100)}% higher than the previous quote for this venue.`
      : undefined,
    averagePeerCost > 0 && perCandidate > averagePeerCost * 1.25
      ? `Per-candidate cost is more than 25% above the other venues in this exam project (${money(averagePeerCost)} average).`
      : undefined,
  ].filter((flag): flag is string => Boolean(flag));
}

export default function ApprovalsPage() {
  const { data, updateData, addAuditLog, currentUser, can } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [tcCodeFilter, setTcCodeFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarksByRecord, setRemarksByRecord] = useState<Record<string, string>>({});
  const [exceptionApproval, setExceptionApproval] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [blanketModalOpen, setBlanketModalOpen] = useState(false);
  const [blanketRemarks, setBlanketRemarks] = useState('');
  const [pastCostModalOpen, setPastCostModalOpen] = useState(false);

  const allowedStages: ApprovalStage[] = [
    ...(can('approve_surveillance') ? ['surveillance_head' as const] : []),
    ...(can('approve_enablement') ? ['enablement_head' as const] : []),
  ];
  const queue = data.installations
    .filter(record => (record.approvalStatus || 'pending') === 'pending' &&
      allowedStages.includes(record.approvalStage || 'surveillance_head'))
    .map(record => record.approvalStage ? record : { ...record, approvalStage: 'surveillance_head' as const })
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const clientOptions = [...new Set(queue.flatMap(record => {
    const requirement = data.requirements.find(item => item.id === record.requirementId);
    return requirement ? [requirement.clientName] : [];
  }))].sort();
  const examOptions = [...new Set(queue.flatMap(record => {
    const requirement = data.requirements.find(item => item.id === record.requirementId);
    return requirement && (!clientFilter || requirement.clientName === clientFilter)
      ? [requirement.examName]
      : [];
  }))].sort();
  const filteredQueue = queue.filter(record => {
    const requirement = data.requirements.find(item => item.id === record.requirementId);
    return (!clientFilter || requirement?.clientName === clientFilter) &&
      (!examFilter || requirement?.examName === examFilter) &&
      (!tcCodeFilter || requirement?.tcCode.replace(/\D/g, '').includes(tcCodeFilter));
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
  const riskFlags = selectedRecord
    ? getCostRiskFlags(selectedRecord, data.requirements, data.installations, data.quoteRevisions, data.examDates)
    : [];
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
  const selectedVisibleIds = selectedIds.filter(id => filteredQueue.some(record => record.id === id));
  const allVisibleSelected = filteredQueue.length > 0 && filteredQueue.every(record => selectedVisibleIds.includes(record.id));
  const selectedApprovalRecords = filteredQueue.filter(record => selectedVisibleIds.includes(record.id));
  const canSelectVenues = Boolean(clientFilter && examFilter);

  const handleDecision = (action: 'approved' | 'sent_back') => {
    if (!selectedRecord || !currentStage || !isAllowedToAct) return;
    const note = (remarksByRecord[selectedRecord.id] || '').trim();
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
    setRemarksByRecord(previous => ({ ...previous, [selectedRecord.id]: '' }));
    setExceptionApproval(false);
    setSelectedId('');
  };

  const handleApproveSelected = () => {
    if (selectedApprovalRecords.length === 0) return;
    const recordsWithoutRevision = selectedApprovalRecords.filter(record =>
      !getLatestRevision(data.quoteRevisions, record.id)
    );
    if (recordsWithoutRevision.length > 0) {
      setSelectedId(recordsWithoutRevision[0].id);
      setAlert({ type: 'error', message: 'Selected quote is missing its revision snapshot. Review it individually before approving.' });
      return;
    }
    const firstMissingRemark = selectedApprovalRecords.find(record =>
      (getCostRiskFlags(record, data.requirements, data.installations, data.quoteRevisions, data.examDates).length > 0 ||
        (record.id === selectedRecord?.id && exceptionApproval)) &&
      !(remarksByRecord[record.id] || '').trim()
    );
    if (firstMissingRemark) {
      setSelectedId(firstMissingRemark.id);
      setAlert({ type: 'error', message: 'Enter approval remarks for each selected venue with a cost discrepancy or exception.' });
      return;
    }
    if (selectedApprovalRecords.some(record =>
      !allowedStages.includes(record.approvalStage || 'surveillance_head')
    )) {
      setAlert({ type: 'error', message: 'One or more selected quotes are not available at your approval stage.' });
      return;
    }

    const createdAt = new Date().toISOString();
    const events: ApprovalEvent[] = selectedApprovalRecords.map(record => {
      const stage = record.approvalStage || 'surveillance_head';
      const revision = getLatestRevision(data.quoteRevisions, record.id)!;
      return {
        id: uuidv4(),
        installationRecordId: record.id,
        stage,
        action: 'approved',
        userId: currentUser!.id,
        remarks: (remarksByRecord[record.id] || '').trim(),
        exception: record.id === selectedRecord?.id ? exceptionApproval : undefined,
        quoteRevisionId: revision.id,
        createdAt,
      };
    });
    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record => {
        const event = events.find(item => item.installationRecordId === record.id);
        if (!event) return record;
        const nextStage = event.stage === 'surveillance_head' ? 'enablement_head' : undefined;
        return {
          ...record,
          approvalStatus: nextStage ? 'pending' : 'approved',
          approvalStage: nextStage,
          updatedAt: createdAt,
        };
      }),
      approvalEvents: [...previous.approvalEvents, ...events],
    }));
    events.forEach(event => addAuditLog('UPDATE', 'InstallationApproval', event.installationRecordId, undefined, event));
    setSelectedIds([]);
    setSelectedId('');
    setExceptionApproval(false);
    setAlert({
      type: 'success',
      message: `${events.length} selected ${events.length === 1 ? 'venue was' : 'venues were'} approved and advanced to the next approval stage where applicable.`,
    });
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
        {selectedVisibleIds.length > 0 && (
          <Button disabled={selectedApprovalRecords.some(record =>
            !can(record.approvalStage === 'enablement_head' ? 'approve_enablement' : 'approve_surveillance')
          )} onClick={handleApproveSelected}>
            <Check size={14} /> Approve selected venues ({selectedVisibleIds.length})
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
              <div className="mt-3 space-y-2">
                <Select label="Client Name" value={clientFilter} onChange={event => {
                  setClientFilter(event.target.value);
                  setExamFilter('');
                  setSelectedId('');
                  setSelectedIds([]);
                }} options={clientOptions.map(client => ({ value: client, label: client }))} placeholder="All clients" />
                <Select label="Exam Name" value={examFilter} onChange={event => {
                  setExamFilter(event.target.value);
                  setSelectedId('');
                  setSelectedIds([]);
                }} options={examOptions.map(exam => ({ value: exam, label: exam }))} placeholder="All exams"
                  disabled={!clientFilter} />
                <Input label="Find TC Code" value={tcCodeFilter} onChange={event => {
                  setTcCodeFilter(event.target.value.replace(/\D/g, ''));
                  setSelectedIds([]);
                }}
                  placeholder="Enter numbers only" inputMode="numeric" pattern="[0-9]*" />
              </div>
              <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={allVisibleSelected} disabled={!canSelectVenues}
                  onChange={event => setSelectedIds(previous => event.target.checked
                    ? [...new Set([...previous, ...filteredQueue.map(record => record.id)])]
                    : previous.filter(id => !filteredQueue.some(record => record.id === id)))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                Select all {filteredQueue.length} matching TC venues
              </label>
              {!canSelectVenues && <p className="mt-1 text-xs text-slate-500">Choose a client and exam to enable TC venue selection.</p>}
            </div>
            <div className="max-h-[680px] overflow-y-auto">
              {filteredQueue.map(record => {
                const requirement = data.requirements.find(item => item.id === record.requirementId);
                const recordVendor = data.vendors.find(item => item.id === record.vendorId);
                const count = getCandidateCount(record, data.quoteRevisions, data.examDates);
                const active = (selectedRecord?.id || selectedId) === record.id;
                return (
                  <div key={record.id} className={`border-b border-slate-100 p-3 transition-colors hover:bg-slate-50 ${active ? 'bg-blue-50/70 ring-inset ring-2 ring-blue-500' : ''}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" aria-label={`Select TC Code ${requirement?.tcCode || 'unknown'}`} disabled={!canSelectVenues}
                        checked={selectedVisibleIds.includes(record.id)}
                        onChange={event => setSelectedIds(previous => event.target.checked
                          ? [...new Set([...previous, record.id])]
                          : previous.filter(id => id !== record.id))}
                        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <button type="button" onClick={() => { setSelectedId(record.id); setAlert(null); }}
                        className="min-w-0 flex-1 text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{requirement?.tcName || 'Unknown venue'}</p>
                            <p className="mt-0.5 text-xs text-slate-500">TC Code {requirement?.tcCode} · {requirement?.zone}</p>
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
                    </div>
                  </div>
                );
              })}
              {filteredQueue.length === 0 && <p className="p-4 text-sm text-slate-500">No TC venues match this client, exam, or code.</p>}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">Past cost at this venue</h3>
                    {(historicalInstallations.length > 0 || revisionHistory.length > 1) && (
                      <Button variant="outline" size="sm" onClick={() => setPastCostModalOpen(true)}>
                        View all past cost details ({historicalInstallations.length + Math.max(0, revisionHistory.length - 1)})
                      </Button>
                    )}
                  </div>
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
                  <p className="text-xs font-medium text-slate-500">Approval remarks for TC Code {selectedRequirement.tcCode}</p>
                  <Textarea label="Remarks"
                    value={remarksByRecord[selectedRecord.id] || ''}
                    onChange={event => setRemarksByRecord(previous => ({
                      ...previous,
                      [selectedRecord.id]: event.target.value,
                    }))}
                    rows={3}
                    placeholder="Explain why this venue's quote is being approved, especially any cost discrepancy." />
                  {selectedVisibleIds.length > 1 && (
                    <p className="text-xs text-slate-500">
                      Add remarks for each selected venue with a cost discrepancy. Select each TC Code to enter its remarks before bulk approval.
                    </p>
                  )}
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

      <Modal open={pastCostModalOpen} onClose={() => setPastCostModalOpen(false)} title={`Past cost details · TC Code ${selectedRequirement?.tcCode || ''}`}>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {selectedRecord && selectedRequirement && revisionHistory.length > 1 && (
            <article className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <h3 className="font-semibold text-slate-900">Previous quotations for this venue · {selectedRequirement.tcName}</h3>
              <ol className="mt-3 space-y-2">
                {revisionHistory.slice(0, -1).reverse().map((revision, index) => (
                  <li key={revision.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-white p-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">Quote {revisionHistory.length - index - 1} · {dateLabel(revision.createdAt)}</p>
                      <p className="mt-1 text-slate-600">
                        {data.vendors.find(item => item.id === revision.vendorId)?.vendorName || 'Vendor unavailable'} · {revision.installationType} · {revision.cameraCount} cameras · {revision.totalCandidates.toLocaleString('en-IN')} candidates
                      </p>
                      {revision.remarks && <p className="mt-1 text-slate-600">Remarks: {revision.remarks}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{money(revision.localVendorCost)}</p>
                      {revision.quotationFileId && <Button variant="outline" size="sm" onClick={() => openQuotation(revision.quotationFileId)}>View quotation</Button>}
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          )}
          {historicalInstallations.map(record => {
            const requirement = data.requirements.find(item => item.id === record.requirementId);
            const pastVendor = data.vendors.find(item => item.id === record.vendorId);
            const pastCandidates = getCandidateCount(record, data.quoteRevisions, data.examDates);
            const pastRevisions = getRevisionHistory(data.quoteRevisions, record.id);
            const pastEvents = data.approvalEvents
              .filter(event => event.installationRecordId === record.id)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return (
              <article key={record.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{requirement?.tcName || 'Venue unavailable'} · {requirement?.tcCode}</h3>
                    <p className="text-xs text-slate-500">{requirement?.clientName} · {requirement?.examName} · {requirement?.city}, {requirement?.state} · {requirement?.zone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">{money(record.localVendorCost)}</p>
                    <p className="text-xs text-slate-500">Updated {dateLabel(record.updatedAt)}</p>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-slate-500">Vendor</dt><dd className="font-medium text-slate-800">{pastVendor?.vendorName || 'Unavailable'}</dd></div>
                  <div><dt className="text-slate-500">Installation</dt><dd className="font-medium text-slate-800">{record.installationType}</dd></div>
                  <div><dt className="text-slate-500">Candidates / per-candidate cost</dt><dd className="font-medium text-slate-800">{pastCandidates.toLocaleString('en-IN')} / {pastCandidates > 0 ? money(record.localVendorCost / pastCandidates) : 'Unavailable'}</dd></div>
                  <div><dt className="text-slate-500">Cameras / minimum cost</dt><dd className="font-medium text-slate-800">{record.cameraCount} / {record.minimumCost === undefined ? 'Unavailable' : money(record.minimumCost)}</dd></div>
                  <div><dt className="text-slate-500">Internet / proxy / storage</dt><dd className="font-medium text-slate-800">{record.internetProvided ? 'Internet' : 'No internet'} / {record.proxyProvided ? 'Proxy' : 'No proxy'} / {record.storageProvided ? `${record.storageQuantity || ''} ${record.storageSize || ''} ${record.storageUnit || ''} ${record.storageType || ''}`.trim() : 'No storage'}</dd></div>
                  <div><dt className="text-slate-500">Record remarks</dt><dd className="font-medium text-slate-800">{record.remarks || 'None'}</dd></div>
                </dl>
                {pastRevisions.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quote revisions</h4>
                    <ol className="mt-2 space-y-2">
                      {pastRevisions.slice().reverse().map((revision, index) => (
                        <li key={revision.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                          <div>
                            <p className="font-medium text-slate-800">{index === 0 ? 'Latest quote' : `Earlier quote ${pastRevisions.length - index}`} · {dateLabel(revision.createdAt)}</p>
                            <p className="text-slate-500">{revision.installationType} · {revision.cameraCount} cameras · {revision.totalCandidates.toLocaleString('en-IN')} candidates · {data.vendors.find(item => item.id === revision.vendorId)?.vendorName || 'Vendor unavailable'}</p>
                            {revision.remarks && <p className="mt-1 text-slate-600">Remarks: {revision.remarks}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-slate-900">{money(revision.localVendorCost)}</p>
                            {revision.quotationFileId && <Button variant="outline" size="sm" onClick={() => openQuotation(revision.quotationFileId)}>View quotation</Button>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {pastEvents.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval history</h4>
                    <ol className="mt-2 space-y-2">
                      {pastEvents.map(event => (
                        <li key={event.id} className="text-xs text-slate-600">
                          <strong>{stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'}</strong>
                          {' · '}{data.users.find(user => user.id === event.userId)?.name || 'Former user'} · {dateLabel(event.createdAt)}
                          {event.remarks && <p className="mt-0.5">{event.remarks}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </Modal>

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
