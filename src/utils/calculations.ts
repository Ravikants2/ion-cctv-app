import type { InstallationRecord, ExamDateDetail, RequirementMaster, VendorMaster, DashboardFilters } from '../types';

export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return '₹0';
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0;
  return numerator / denominator;
}

export function getInstallationStats(
  installation: InstallationRecord,
  examDates: ExamDateDetail[]
) {
  const dates = examDates.filter(d => d.installationRecordId === installation.id);
  const uniqueDates = [...new Set(dates.map(d => d.examDate))];
  const totalCandidates = dates.reduce((s, d) => s + d.scheduledCandidates, 0);
  const perCandidateCost = safeDiv(installation.localVendorCost, totalCandidates);
  return { examDays: uniqueDates.length, totalCandidates, perCandidateCost, uniqueDates };
}

export function applyDashboardFilters(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  examDates: ExamDateDetail[],
  filters: DashboardFilters
): InstallationRecord[] {
  return installations.filter(inst => {
    const req = requirements.find(r => r.id === inst.requirementId);
    if (!req) return false;
    if (filters.client && req.clientName !== filters.client) return false;
    if (filters.exam && req.examName !== filters.exam) return false;
    if (filters.zone && req.zone !== filters.zone) return false;
    if (filters.startDate || filters.endDate) {
      const dates = examDates.filter(d => d.installationRecordId === inst.id).map(d => d.examDate);
      if (!dates.some(d =>
        (!filters.startDate || d >= filters.startDate) &&
        (!filters.endDate || d <= filters.endDate)
      )) return false;
    }
    return true;
  });
}

export function getUniqueExamDays(installations: InstallationRecord[], examDates: ExamDateDetail[]): string[] {
  const ids = new Set(installations.map(i => i.id));
  const allDates = examDates.filter(d => ids.has(d.installationRecordId)).map(d => d.examDate);
  return [...new Set(allDates)];
}

export function getDashboardKPIs(
  installations: InstallationRecord[],
  requirements: RequirementMaster[],
  _vendors: VendorMaster[],
  examDates: ExamDateDetail[]
) {
  const totalCost = installations.reduce((s, i) => s + i.localVendorCost, 0);
  const totalCandidates = installations.reduce((s, i) => {
    return s + examDates.filter(d => d.installationRecordId === i.id).reduce((ss, d) => ss + d.scheduledCandidates, 0);
  }, 0);
  const totalCameras = installations.reduce((s, i) => s + i.cameraCount, 0);
  const uniqueDates = getUniqueExamDays(installations, examDates);
  const uniqueVenueIds = [...new Set(installations.map(i => i.requirementId))];
  const uniqueClients = [...new Set(requirements.filter(r => uniqueVenueIds.includes(r.id)).map(r => r.clientName))];
  const uniqueExams = [...new Set(requirements.filter(r => uniqueVenueIds.includes(r.id)).map(r => r.examName))];
  const uniqueVendorIds = [...new Set(installations.map(i => i.vendorId))];

  return {
    venues: uniqueVenueIds.length,
    examDays: uniqueDates.length,
    candidates: totalCandidates,
    cameras: totalCameras,
    totalCost,
    perCandidateCost: safeDiv(totalCost, totalCandidates),
    vendors: uniqueVendorIds.length,
    clients: uniqueClients.length,
    exams: uniqueExams.length,
    costPerVenue: safeDiv(totalCost, uniqueVenueIds.length),
    costPerCamera: safeDiv(totalCost, totalCameras),
    candidatesPerCamera: safeDiv(totalCandidates, totalCameras),
  };
}
