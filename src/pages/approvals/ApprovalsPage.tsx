import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Alert, Modal } from '../../components/ui/index';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/FormFields';
import { useAuth } from '../../context/AuthContext';
import { normalizeExamDate } from '../../utils/dates';
import type { ApprovalEvent, ApprovalStage, ApprovalStatus, InstallationRecord, QuoteRevision } from '../../types';
import { AlertCircle, Check, CornerUpLeft, History } from 'lucide-react';

const stageTitle: Record<ApprovalStage, string> = {
  surveillance_head: 'Surveillance Head',
  enablement_head: 'Head of Enablement',
};

const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (date: string) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime())
    ? date
    : value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function getRevisions(revisions: QuoteRevision[], recordId: string) {
  return revisions
    .filter(revision => revision.installationRecordId === recordId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function getCandidates(record: InstallationRecord, revisions: QuoteRevision[], examDates: Array<{
  installationRecordId: string;
  scheduledCandidates: number;
}>) {
  const recordRevisions = getRevisions(revisions, record.id);
  const latestRevision = recordRevisions[recordRevisions.length - 1];
  return latestRevision?.totalCandidates ??
    examDates.filter(date => date.installationRecordId === record.id)
      .reduce((total, date) => total + date.scheduledCandidates, 0);
}

function sameVenue(
  left: { zone: string; state: string; city: string; tcCode: string },
  right: { zone: string; state: string; city: string; tcCode: string }
) {
  return [left.zone, left.state, left.city, left.tcCode]
    .every((value, index) => value.trim().toLocaleLowerCase() ===
      [right.zone, right.state, right.city, right.tcCode][index].trim().toLocaleLowerCase());
}

export default function ApprovalsPage() {
  const { data, updateData, addAuditLog, currentUser, can } = useAuth();
  const [clientFilter, setClientFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [tcCodeFilter, setTcCodeFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarksByRecord, setRemarksByRecord] = useState<Record<string, string>>({});
  const [exceptionApproval, setExceptionApproval] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState('');
  const [alertRecordId, setAlertRecordId] = useState('');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const allowedStages: ApprovalStage[] = [
    ...(can('approve_surveillance') ? ['surveillance_head' as const] : []),
    ...(can('approve_enablement') ? ['enablement_head' as const] : []),
  ];
  const queue = data.installations
    .filter(record => (record.approvalStatus || 'pending') === 'pending' &&
      allowedStages.includes(record.approvalStage || 'surveillance_head'))
    .map(record => record.approvalStage
      ? record
      : { ...record, approvalStage: 'surveillance_head' as const })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

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
    ? data.requirements.find(item => item.id === selectedRecord.requirementId)
    : undefined;
  const selectedStage = selectedRecord?.approvalStage || 'surveillance_head';
  const selectedVendor = selectedRecord
    ? data.vendors.find(item => item.id === selectedRecord.vendorId)
    : undefined;
  const selectedRevisionHistory = selectedRecord
    ? getRevisions(data.quoteRevisions, selectedRecord.id)
    : [];
  const previousRevision = selectedRevisionHistory.length > 1
    ? selectedRevisionHistory[selectedRevisionHistory.length - 2]
    : undefined;
  const selectedCandidates = selectedRecord
    ? getCandidates(selectedRecord, data.quoteRevisions, data.examDates)
    : 0;
  const selectedPerCandidate = selectedRecord && selectedCandidates > 0
    ? selectedRecord.localVendorCost / selectedCandidates
    : 0;
  const venueRecords = useMemo(() => {
    if (!selectedRequirement) return [];
    return data.installations.flatMap(record => {
      const requirement = data.requirements.find(item => item.id === record.requirementId);
      return requirement && sameVenue(requirement, selectedRequirement)
        ? [{ record, requirement }]
        : [];
    }).sort((left, right) =>
      left.requirement.examName.localeCompare(right.requirement.examName) ||
      left.record.createdAt.localeCompare(right.record.createdAt)
    );
  }, [data.installations, data.requirements, selectedRequirement]);
  const venueRecordIds = new Set(venueRecords.map(item => item.record.id));
  const venueSchedule = data.examDates.filter(item => venueRecordIds.has(item.installationRecordId));
  const totalVenueCost = venueRecords.reduce((total, item) => total + item.record.localVendorCost, 0);
  const totalVenueCandidates = venueRecords.reduce((total, item) =>
    total + getCandidates(item.record, data.quoteRevisions, data.examDates), 0);
  const temporaryCctvDays = new Set(venueSchedule.map(item =>
    normalizeExamDate(item.examDate) || item.examDate
  )).size;
  const totalCostPerCandidate = totalVenueCandidates > 0
    ? totalVenueCost / totalVenueCandidates
    : 0;

  const projectRecords = selectedRecord && selectedRequirement
    ? data.installations.flatMap(record => {
        if (record.id === selectedRecord.id) return [];
        const requirement = data.requirements.find(item => item.id === record.requirementId);
        if (requirement?.clientName !== selectedRequirement.clientName ||
          requirement.examName !== selectedRequirement.examName) return [];
        const candidates = getCandidates(record, data.quoteRevisions, data.examDates);
        return candidates > 0
          ? [{ cost: record.localVendorCost, perCandidate: record.localVendorCost / candidates }]
          : [];
      })
      : [];
  const averageProjectPerCandidate = projectRecords.length > 0
      ? projectRecords.reduce((total, item) => total + item.perCandidate, 0) / projectRecords.length
      : 0;
  const previousQuoteIncrease = selectedRecord && previousRevision && previousRevision.localVendorCost > 0
    ? (selectedRecord.localVendorCost - previousRevision.localVendorCost) / previousRevision.localVendorCost
    : undefined;
  const costFlags = selectedRecord ? [
    ...(previousQuoteIncrease !== undefined && previousQuoteIncrease > 0.2
      ? [`Current quote increased ${Math.round(previousQuoteIncrease * 100)}% compared with its previous quote (${money(previousRevision!.localVendorCost)}).`]
      : []),
    ...(averageProjectPerCandidate > 0 && selectedPerCandidate > averageProjectPerCandidate * 1.25
      ? [`Cost per candidate (${money(selectedPerCandidate)}) is more than 25% above the client/exam average (${money(averageProjectPerCandidate)}).`]
      : []),
    ...(projectRecords.length > 0 && selectedRecord.localVendorCost > Math.max(...projectRecords.map(item => item.cost))
      ? [`Current total venue cost (${money(selectedRecord.localVendorCost)}) is higher than all other venues for this client/exam.`]
      : []),
    ...(projectRecords.length > 0 && selectedPerCandidate > Math.max(...projectRecords.map(item => item.perCandidate))
      ? [`Current cost per candidate (${money(selectedPerCandidate)}) is higher than all other venues for this client/exam.`]
      : []),
  ] : [];
  const currentApprovalEvents = selectedRecord
    ? data.approvalEvents
      .filter(event => event.installationRecordId === selectedRecord.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];

  const selectedVisibleIds = selectedIds.filter(id => filteredQueue.some(record => record.id === id));
  const allVisibleSelected = filteredQueue.length > 0 &&
    filteredQueue.every(record => selectedVisibleIds.includes(record.id));
  const selectedApprovalRecords = filteredQueue.filter(record => selectedVisibleIds.includes(record.id));
  const canSelectVenues = Boolean(clientFilter && examFilter);
  const isAllowedToAct = selectedStage === 'surveillance_head'
    ? can('approve_surveillance')
    : can('approve_enablement');

  const handleDecision = (action: 'approved' | 'sent_back') => {
    if (!selectedRecord || !isAllowedToAct) return;
    const note = (remarksByRecord[selectedRecord.id] || '').trim();
    if (action === 'sent_back' && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when sending a quote back.' });
      return;
    }
    if (action === 'approved' && (costFlags.length > 0 || exceptionApproval) && !note) {
      setAlert({ type: 'error', message: 'Remarks are mandatory when approving a cost alert or exception.' });
      return;
    }
    const revisions = getRevisions(data.quoteRevisions, selectedRecord.id);
    const revision = revisions[revisions.length - 1];
    if (!revision) {
      setAlert({ type: 'error', message: 'This quote has no saved revision snapshot and cannot be approved.' });
      return;
    }
    const event: ApprovalEvent = {
      id: uuidv4(),
      installationRecordId: selectedRecord.id,
      stage: selectedStage,
      action,
      userId: currentUser!.id,
      remarks: note,
      exception: action === 'approved' ? exceptionApproval : undefined,
      quoteRevisionId: revision.id,
      createdAt: new Date().toISOString(),
    };
    const nextStage = selectedStage === 'surveillance_head' ? 'enablement_head' : undefined;
    const nextStatus: ApprovalStatus = action === 'sent_back'
      ? 'returned'
      : nextStage ? 'pending' : 'approved';
    updateData(previous => ({
      ...previous,
      installations: previous.installations.map(record => record.id === selectedRecord.id
        ? {
            ...record,
            approvalStatus: nextStatus,
            approvalStage: action === 'sent_back' ? selectedStage : nextStage,
            updatedAt: event.createdAt,
          }
        : record),
      approvalEvents: [...previous.approvalEvents, event],
    }));
    addAuditLog('UPDATE', 'InstallationApproval', selectedRecord.id, undefined, event);
    setAlert({
      type: 'success',
      message: action === 'sent_back'
        ? `Quote sent back to ${selectedRequirement?.zone || 'the zonal user'}.`
        : nextStage
          ? `Approved by ${stageTitle[selectedStage]}; forwarded to ${stageTitle[nextStage]}.`
          : 'Quote approved by both levels.',
    });
    setRemarksByRecord(previous => ({ ...previous, [selectedRecord.id]: '' }));
    setExceptionApproval(false);
    setSelectedId('');
  };

  const handleApproveSelected = () => {
    if (selectedApprovalRecords.length === 0) return;
    const firstMissingRevision = selectedApprovalRecords.find(record =>
      !getRevisions(data.quoteRevisions, record.id).length
    );
    if (firstMissingRevision) {
      setSelectedId(firstMissingRevision.id);
      setAlert({ type: 'error', message: 'A selected quote has no revision snapshot. Review it individually before approval.' });
      return;
    }
    const firstMissingRemark = selectedApprovalRecords.find(record => {
      const requirement = data.requirements.find(item => item.id === record.requirementId);
      const flags = getCostFlagsForRecord(record, requirement, data.installations, data.requirements, data.quoteRevisions, data.examDates);
      return flags.length > 0 && !(remarksByRecord[record.id] || '').trim();
    });
    if (firstMissingRemark) {
      setSelectedId(firstMissingRemark.id);
      setAlert({ type: 'error', message: 'Enter approval remarks for each selected venue with a cost alert.' });
      return;
    }
    const events: ApprovalEvent[] = selectedApprovalRecords.map(record => {
      const stage = record.approvalStage || 'surveillance_head';
      const revisions = getRevisions(data.quoteRevisions, record.id);
      const revision = revisions[revisions.length - 1];
      return {
        id: uuidv4(),
        installationRecordId: record.id,
        stage,
        action: 'approved',
        userId: currentUser!.id,
        remarks: (remarksByRecord[record.id] || '').trim(),
        quoteRevisionId: revision.id,
        createdAt: new Date().toISOString(),
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
          updatedAt: event.createdAt,
        };
      }),
      approvalEvents: [...previous.approvalEvents, ...events],
    }));
    events.forEach(event =>
      addAuditLog('UPDATE', 'InstallationApproval', event.installationRecordId, undefined, event)
    );
    setSelectedIds([]);
    setSelectedId('');
    setAlert({
      type: 'success',
      message: `${events.length} selected ${events.length === 1 ? 'venue was' : 'venues were'} approved.`,
    });
  };

  const openQuotation = (fileId?: string) => {
    if (!fileId) return;
    const quote = data.quotations.find(item => item.id === fileId);
    if (!quote) {
      setAlert({ type: 'error', message: 'Quotation file attached to this revision is missing.' });
      return;
    }
    const windowRef = window.open();
    if (!windowRef) {
      setAlert({ type: 'error', message: 'Your browser blocked the quotation window. Allow pop-ups and try again.' });
      return;
    }
    windowRef.document.write(`<iframe src="${quote.dataUrl}" title="Quotation PDF" width="100%" height="100%" style="border:0"></iframe>`);
  };

  const detailsRecord = detailRecordId
    ? data.installations.find(record => record.id === detailRecordId)
    : undefined;
  const detailsRequirement = detailsRecord
    ? data.requirements.find(requirement => requirement.id === detailsRecord.requirementId)
    : undefined;
  const alertRecord = alertRecordId
    ? data.installations.find(record => record.id === alertRecordId)
    : undefined;
  const alertRequirement = alertRecord
    ? data.requirements.find(requirement => requirement.id === alertRecord.requirementId)
    : undefined;
  const alertFlags = alertRecord
    ? getCostFlagsForRecord(alertRecord, alertRequirement, data.installations, data.requirements, data.quoteRevisions, data.examDates)
    : [];
  const displayedScheduleCostIds = new Set<string>();

  return (
    <div className="space-y-5">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Quote review workflow</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Approvals</h1>
        <p className="mt-1 text-sm text-slate-500">Review venue location, temporary CCTV days, recorded cost, vendor history, and approval remarks.</p>
      </header>

      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert>}

      {queue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Check className="mx-auto mb-3 text-emerald-600" size={30} />
          <h2 className="font-semibold text-slate-800">No quotes waiting for your review</h2>
          <p className="mt-1 text-sm text-slate-500">New and resubmitted quotes appear here at the appropriate approval level.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            <Select label="Client Name" value={clientFilter} onChange={event => {
              setClientFilter(event.target.value);
              setExamFilter('');
              setSelectedId('');
              setSelectedIds([]);
            }} options={clientOptions.map(client => ({ value: client, label: client }))} placeholder="Select client" />
            <Select label="Exam Name" value={examFilter} onChange={event => {
              setExamFilter(event.target.value);
              setSelectedId('');
              setSelectedIds([]);
            }} options={examOptions.map(exam => ({ value: exam, label: exam }))} placeholder="Select exam" disabled={!clientFilter} />
            <Input label="TC Code" value={tcCodeFilter} onChange={event => {
              setTcCodeFilter(event.target.value.replace(/\D/g, ''));
              setSelectedIds([]);
            }} inputMode="numeric" pattern="[0-9]*" placeholder="Numbers only" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">TC venue details for approval</h2>
                <p className="text-xs text-slate-500">{filteredQueue.length} venue quote{filteredQueue.length === 1 ? '' : 's'} waiting at your approval level</p>
              </div>
              {selectedVisibleIds.length > 0 && (
                <Button onClick={handleApproveSelected} disabled={selectedApprovalRecords.some(record =>
                  !can(record.approvalStage === 'enablement_head' ? 'approve_enablement' : 'approve_surveillance')
                )}>
                  <Check size={14} /> Approve selected ({selectedVisibleIds.length})
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">
                      <input aria-label="Select all matching venues" type="checkbox"
                        checked={allVisibleSelected} disabled={!canSelectVenues}
                        onChange={event => setSelectedIds(event.target.checked
                          ? filteredQueue.map(record => record.id)
                          : [])}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    {['Zone', 'State', 'City', 'TC Code', 'Vendor Name', 'Cost for approval', 'Temporary CCTV days', 'Cost history'].map(label =>
                      <th key={label} className="whitespace-nowrap px-3 py-3">{label}</th>
                    )}
                    <th className="px-3 py-3">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map(record => {
                    const requirement = data.requirements.find(item => item.id === record.requirementId);
                    if (!requirement) return null;
                    const vendorName = data.vendors.find(item => item.id === record.vendorId)?.vendorName || 'Vendor unavailable';
                    const active = record.id === (selectedRecord?.id || selectedId);
                    const flags = getCostFlagsForRecord(record, requirement, data.installations, data.requirements, data.quoteRevisions, data.examDates);
                    const recordVenueEntries = data.installations.filter(item => {
                      const itemRequirement = data.requirements.find(row => row.id === item.requirementId);
                      return itemRequirement && sameVenue(itemRequirement, requirement);
                    });
                    const dates = data.examDates.filter(item =>
                      recordVenueEntries.some(entry => entry.id === item.installationRecordId)
                    );
                    const days = new Set(dates.map(item => normalizeExamDate(item.examDate) || item.examDate)).size;
                    return (
                      <tr key={record.id} className={`border-t border-slate-100 ${active ? 'bg-blue-50/60' : ''}`}>
                        <td className="px-3 py-3">
                          <input aria-label={`Select TC Code ${requirement.tcCode}`} type="checkbox"
                            checked={selectedVisibleIds.includes(record.id)} disabled={!canSelectVenues}
                            onChange={event => setSelectedIds(previous => event.target.checked
                              ? [...new Set([...previous, record.id])]
                              : previous.filter(id => id !== record.id))}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">{requirement.zone}</td>
                        <td className="whitespace-nowrap px-3 py-3">{requirement.state}</td>
                        <td className="whitespace-nowrap px-3 py-3">{requirement.city}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <button type="button" onClick={() => {
                            setSelectedId(record.id);
                            setExceptionApproval(false);
                            setAlert(null);
                          }} className="font-mono font-semibold text-blue-700 hover:underline">
                            {requirement.tcCode}
                          </button>
                          <p className="text-xs text-slate-500">{stageTitle[record.approvalStage || 'surveillance_head']}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">{vendorName}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{money(record.localVendorCost)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{days}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <Button variant="outline" size="sm" onClick={() => setDetailRecordId(record.id)}>
                            <History size={13} /> Past costs
                          </Button>
                        </td>
                        <td className="px-3 py-3">
                          {flags.length > 0 && (
                            <button type="button" onClick={() => setAlertRecordId(record.id)}
                              className="inline-flex animate-pulse items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                              aria-label={`Cost alert details for TC Code ${requirement.tcCode}`}>
                              <AlertCircle size={13} /> Review
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredQueue.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">No TC venues match the selected client, exam, or code.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {!canSelectVenues && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Choose a client and exam to enable venue selection.</p>}
          </section>

          {selectedRecord && selectedRequirement && (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedRequirement.clientName} · {selectedRequirement.examName}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedRequirement.tcName} · {selectedRequirement.tcCode}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedRequirement.zone} · {selectedRequirement.state} · {selectedRequirement.city} · {selectedVendor?.vendorName || 'Vendor unavailable'}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{stageTitle[selectedStage]}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Temporary CCTV days', temporaryCctvDays.toLocaleString('en-IN')],
                    ['Recorded cost till now', money(totalVenueCost)],
                    ['Candidates till now', totalVenueCandidates.toLocaleString('en-IN')],
                    ['Cost per candidate till now', totalVenueCandidates > 0 ? money(totalCostPerCandidate) : 'Unavailable'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">Exam-wise temporary CCTV use and cost</h3>
                  <Button variant="outline" size="sm" onClick={() => setDetailRecordId(selectedRecord.id)}>
                    <History size={13} /> Full venue and vendor cost history
                  </Button>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Client', 'Exam', 'Exam date', 'Candidates', 'Vendor', 'Installation quote'].map(label =>
                        <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>
                      {venueSchedule.slice().sort((left, right) =>
                        (normalizeExamDate(left.examDate) || left.examDate).localeCompare(normalizeExamDate(right.examDate) || right.examDate)
                      ).map(schedule => {
                        const item = venueRecords.find(entry => entry.record.id === schedule.installationRecordId);
                        if (!item) return null;
                        const scheduleVendor = data.vendors.find(vendor => vendor.id === item.record.vendorId);
                        const showCost = !displayedScheduleCostIds.has(item.record.id);
                        displayedScheduleCostIds.add(item.record.id);
                        return (
                          <tr key={schedule.id} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-3 py-2">{item.requirement.clientName}</td>
                            <td className="whitespace-nowrap px-3 py-2">{item.requirement.examName}</td>
                            <td className="whitespace-nowrap px-3 py-2">{dateLabel(schedule.examDate)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{schedule.scheduledCandidates.toLocaleString('en-IN')}</td>
                            <td className="whitespace-nowrap px-3 py-2">{scheduleVendor?.vendorName || 'Unavailable'}</td>
                            <td className="whitespace-nowrap px-3 py-2">{showCost ? money(item.record.localVendorCost) : '—'}</td>
                          </tr>
                        );
                      })}
                      {venueSchedule.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-5 text-center text-sm text-slate-500">No exam-date detail is recorded for this venue.</td></tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <tr>
                        <td colSpan={3} className="px-3 py-2">Total · {temporaryCctvDays} distinct temporary CCTV days</td>
                        <td className="whitespace-nowrap px-3 py-2">{totalVenueCandidates.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2">All recorded vendors</td>
                        <td className="whitespace-nowrap px-3 py-2">{money(totalVenueCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Approval decision</h3>
                <p className="mt-1 text-xs text-slate-500">Current quote: {money(selectedRecord.localVendorCost)} · {selectedVendor?.vendorName || 'Vendor unavailable'}</p>
                {costFlags.length > 0 && (
                  <button type="button" onClick={() => setAlertRecordId(selectedRecord.id)}
                    className="mt-3 flex w-full animate-pulse items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-900">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{costFlags.length} cost alert{costFlags.length === 1 ? '' : 's'} · Click to inspect the comparison</span>
                  </button>
                )}
                <div className="mt-4 space-y-3">
                  <Textarea label={`Remarks for TC Code ${selectedRequirement.tcCode}`} rows={4}
                    value={remarksByRecord[selectedRecord.id] || ''}
                    onChange={event => setRemarksByRecord(previous => ({
                      ...previous,
                      [selectedRecord.id]: event.target.value,
                    }))}
                    placeholder="Required when approving a cost alert or sending the quote back." />
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={exceptionApproval} onChange={event => setExceptionApproval(event.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span><strong>Exception approval</strong><span className="block text-xs text-slate-500">Requires remarks.</span></span>
                  </label>
                  {!isAllowedToAct && <p className="text-sm text-amber-700">Your role cannot approve this stage.</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={!isAllowedToAct} onClick={() => handleDecision('sent_back')}>
                      <CornerUpLeft size={14} /> Send back
                    </Button>
                    <Button disabled={!isAllowedToAct} onClick={() => handleDecision('approved')}>
                      <Check size={14} /> {selectedStage === 'surveillance_head' ? 'Approve and forward' : 'Approve final'}
                    </Button>
                  </div>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-semibold text-slate-800">Venue approval history</h4>
                  {currentApprovalEvents.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No approval decisions recorded.</p>
                  ) : (
                    <ol className="mt-2 space-y-3">
                      {currentApprovalEvents.map(event => (
                        <li key={event.id} className="border-l-2 border-blue-200 pl-3 text-xs">
                          <p className="font-medium text-slate-800">{stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'}</p>
                          <p className="text-slate-500">{data.users.find(user => user.id === event.userId)?.name || 'Former user'} · {dateLabel(event.createdAt)}</p>
                          <p className="mt-1 text-slate-700">Quote at decision: {money(data.quoteRevisions.find(revision => revision.id === event.quoteRevisionId)?.localVendorCost || 0)}</p>
                          {event.remarks && <p className="mt-1 text-slate-600">{event.remarks}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <Modal open={Boolean(detailRecordId && detailsRecord && detailsRequirement)}
        onClose={() => setDetailRecordId('')}
        title={`Venue cost history · TC Code ${detailsRequirement?.tcCode || ''}`}>
        {detailsRecord && detailsRequirement && (() => {
          const records = data.installations.flatMap(record => {
            const requirement = data.requirements.find(item => item.id === record.requirementId);
            return requirement && sameVenue(requirement, detailsRequirement)
              ? [{ record, requirement }]
              : [];
          }).sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt));
          const recordIds = new Set(records.map(item => item.record.id));
          const schedule = data.examDates.filter(item => recordIds.has(item.installationRecordId));
          const totalCost = records.reduce((total, item) => total + item.record.localVendorCost, 0);
          const totalCandidates = records.reduce((total, item) =>
            total + getCandidates(item.record, data.quoteRevisions, data.examDates), 0);
          const vendorGroups = [...new Set(records.map(item => item.record.vendorId))].map(vendorId => {
            const vendorRecords = records.filter(item => item.record.vendorId === vendorId);
            return {
              vendorId,
              vendorName: data.vendors.find(vendor => vendor.id === vendorId)?.vendorName || 'Vendor unavailable',
              cost: vendorRecords.reduce((total, item) => total + item.record.localVendorCost, 0),
              candidates: vendorRecords.reduce((total, item) =>
                total + getCandidates(item.record, data.quoteRevisions, data.examDates), 0),
            };
          });
          const displayedHistoryCostIds = new Set<string>();
          return (
            <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <Summary label="Temporary CCTV days" value={new Set(schedule.map(item => normalizeExamDate(item.examDate) || item.examDate)).size.toLocaleString('en-IN')} />
                <Summary label="Total recorded cost till now" value={money(totalCost)} />
                <Summary label="Cost per candidate till now" value={totalCandidates > 0 ? money(totalCost / totalCandidates) : 'Unavailable'} />
              </div>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Vendor-wise recorded cost</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Vendor', 'Installations', 'Candidates', 'Recorded cost'].map(label =>
                        <th key={label} className="px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>{vendorGroups.map(group => (
                      <tr key={group.vendorId} className="border-t border-slate-100">
                        <td className="px-3 py-2">{group.vendorName}</td>
                        <td className="px-3 py-2">{records.filter(item => item.record.vendorId === group.vendorId).length}</td>
                        <td className="px-3 py-2">{group.candidates.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 font-semibold">{money(group.cost)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Exam and date-wise temporary CCTV use</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>{['Client', 'Exam', 'Exam date', 'Candidates', 'Vendor', 'Installation quote'].map(label =>
                        <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
                      )}</tr>
                    </thead>
                    <tbody>{schedule.slice().sort((left, right) =>
                      (normalizeExamDate(left.examDate) || left.examDate).localeCompare(normalizeExamDate(right.examDate) || right.examDate)
                    ).map(item => {
                      const record = records.find(entry => entry.record.id === item.installationRecordId);
                      if (!record) return null;
                      const showCost = !displayedHistoryCostIds.has(record.record.id);
                      displayedHistoryCostIds.add(record.record.id);
                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-3 py-2">{record.requirement.clientName}</td>
                          <td className="whitespace-nowrap px-3 py-2">{record.requirement.examName}</td>
                          <td className="whitespace-nowrap px-3 py-2">{dateLabel(item.examDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2">{item.scheduledCandidates.toLocaleString('en-IN')}</td>
                          <td className="whitespace-nowrap px-3 py-2">{data.vendors.find(vendor => vendor.id === record.record.vendorId)?.vendorName || 'Unavailable'}</td>
                          <td className="whitespace-nowrap px-3 py-2">{showCost ? money(record.record.localVendorCost) : '—'}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-2 font-semibold text-slate-900">Quote and approval cost history</h3>
                <ol className="space-y-3">
                  {records.map(({ record, requirement }) => {
                    const vendorName = data.vendors.find(vendor => vendor.id === record.vendorId)?.vendorName || 'Vendor unavailable';
                    const revisions = getRevisions(data.quoteRevisions, record.id);
                    const events = data.approvalEvents.filter(event => event.installationRecordId === record.id);
                    return (
                      <li key={record.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{requirement.clientName} · {requirement.examName} · {vendorName}</p>
                            <p className="text-xs text-slate-500">{dateLabel(record.createdAt)} · {record.approvalStatus || 'pending'}</p>
                          </div>
                          <p className="font-semibold text-slate-900">{money(record.localVendorCost)}</p>
                        </div>
                        {revisions.map(revision => (
                          <div key={revision.id} className="mt-2 flex flex-wrap items-start justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                            <div>
                              <p className="text-slate-700">Quote revision · {dateLabel(revision.createdAt)} · {data.vendors.find(vendor => vendor.id === revision.vendorId)?.vendorName || 'Vendor unavailable'}</p>
                              {revision.remarks && <p className="mt-0.5 text-slate-500">Quote remarks: {revision.remarks}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-800">{money(revision.localVendorCost)}</p>
                              {revision.quotationFileId && <Button variant="outline" size="sm" onClick={() => openQuotation(revision.quotationFileId)}>View quote</Button>}
                            </div>
                          </div>
                        ))}
                        {events.map(event => (
                          <div key={event.id} className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                            {stageTitle[event.stage]} · {event.action === 'approved' ? 'Approved' : 'Sent back'} · {data.users.find(user => user.id === event.userId)?.name || 'Former user'} · {dateLabel(event.createdAt)}
                            <span className="ml-2 font-semibold text-slate-800">
                              {money(data.quoteRevisions.find(revision => revision.id === event.quoteRevisionId)?.localVendorCost || 0)}
                            </span>
                            {event.remarks && <p className="mt-1">{event.remarks}</p>}
                          </div>
                        ))}
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          );
        })()}
      </Modal>

      <Modal open={Boolean(alertRecord && alertRequirement)}
        onClose={() => setAlertRecordId('')}
        title={`Cost alert details · TC Code ${alertRequirement?.tcCode || ''}`}>
        {alertRecord && alertRequirement && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {alertRequirement.zone} · {alertRequirement.state} · {alertRequirement.city} · {alertRequirement.clientName} · {alertRequirement.examName}
            </p>
            {alertFlags.length > 0 ? (
              <ul className="space-y-2">
                {alertFlags.map(flag => (
                  <li key={flag} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />{flag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No active cost alerts for this venue.</p>
            )}
            <p className="text-xs text-slate-500">
              Current approval quote: {money(alertRecord.localVendorCost)} · Vendor: {data.vendors.find(vendor => vendor.id === alertRecord.vendorId)?.vendorName || 'Unavailable'}
            </p>
            <Button variant="outline" onClick={() => {
              setDetailRecordId(alertRecord.id);
              setAlertRecordId('');
            }}><History size={13} /> Open venue cost history</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function getCostFlagsForRecord(
  record: InstallationRecord,
  requirement: { clientName: string; examName: string } | undefined,
  installations: InstallationRecord[],
  requirements: ReturnType<typeof useAuth>['data']['requirements'],
  revisions: QuoteRevision[],
  examDates: Array<{ installationRecordId: string; scheduledCandidates: number }>
) {
  if (!requirement) return [];
  const history = getRevisions(revisions, record.id);
  const previous = history.length > 1 ? history[history.length - 2] : undefined;
  const increase = previous && previous.localVendorCost > 0
    ? (record.localVendorCost - previous.localVendorCost) / previous.localVendorCost
    : undefined;
  const candidates = getCandidates(record, revisions, examDates);
  const peerValues = installations.flatMap(peer => {
    if (peer.id === record.id) return [];
    const peerRequirement = requirements.find(item => item.id === peer.requirementId);
    if (peerRequirement?.clientName !== requirement.clientName ||
      peerRequirement.examName !== requirement.examName) return [];
    const peerCandidates = getCandidates(peer, revisions, examDates);
    return peerCandidates > 0
      ? [{ cost: peer.localVendorCost, perCandidate: peer.localVendorCost / peerCandidates }]
      : [];
  });
  const averagePerCandidate = peerValues.length > 0
    ? peerValues.reduce((total, value) => total + value.perCandidate, 0) / peerValues.length
    : 0;
  const perCandidate = candidates > 0 ? record.localVendorCost / candidates : 0;
  return [
    ...(increase !== undefined && increase > 0.2
      ? [`Current quote increased ${Math.round(increase * 100)}% compared with its previous quote (${money(previous!.localVendorCost)}).`]
      : []),
    ...(averagePerCandidate > 0 && perCandidate > averagePerCandidate * 1.25
      ? [`Cost per candidate (${money(perCandidate)}) is more than 25% above the client/exam average (${money(averagePerCandidate)}).`]
      : []),
    ...(peerValues.length > 0 && record.localVendorCost > Math.max(...peerValues.map(value => value.cost))
      ? [`Current total venue cost (${money(record.localVendorCost)}) is higher than all other venues for this client/exam.`]
      : []),
    ...(peerValues.length > 0 && perCandidate > Math.max(...peerValues.map(value => value.perCandidate))
      ? [`Current cost per candidate (${money(perCandidate)}) is higher than all other venues for this client/exam.`]
      : []),
  ];
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
