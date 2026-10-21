import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { GlobalFilters } from '../../components/dashboard/GlobalFilters';
import { Button } from '../../components/ui/Button';
import { SortableTable } from '../../components/ui/SortableTable';
import { CostValue } from '../../components/ui/CostValue';
import { applyDashboardFilters, safeDiv } from '../../utils/calculations';
import { TablePagination } from '../../components/ui/TablePagination';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';

const PAGE_SIZE = 25;
type VenueMetric = 'days' | 'candidates' | 'cost' | 'perCandidate' | 'vendors';

interface VenueSummary {
  key: string;
  zone: string;
  state: string;
  tcCode: string;
  tcName: string;
  installations: ReturnType<typeof applyDashboardFilters>;
  days: number;
  candidates: number;
  cost: number;
  perCandidate: number;
  vendors: string[];
}

export default function VenueDashboard() {
  const { data } = useAuth();
  const { filters } = useFilters();
  const [selected, setSelected] = useState<{ key: string; metric: VenueMetric } | null>(null);
  const [page, setPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const filtered = applyDashboardFilters(data.installations, data.requirements, data.examDates, filters);

  const groups = new Map<string, VenueSummary>();
  filtered.forEach(installation => {
    const requirement = data.requirements.find(row => row.id === installation.requirementId);
    if (!requirement) return;
    const key = JSON.stringify([requirement.zone, requirement.state, requirement.tcCode, requirement.tcName]);
    let venue = groups.get(key);
    if (!venue) {
      venue = {
        key,
        zone: requirement.zone,
        state: requirement.state,
        tcCode: requirement.tcCode,
        tcName: requirement.tcName,
        installations: [],
        days: 0,
        candidates: 0,
        cost: 0,
        perCandidate: 0,
        vendors: [],
      };
      groups.set(key, venue);
    }
    venue.installations.push(installation);
  });
  const venues = Array.from(groups.values()).map(venue => {
    const installationIds = new Set(venue.installations.map(row => row.id));
    const schedule = data.examDates.filter(row => installationIds.has(row.installationRecordId));
    const candidates = schedule.reduce((total, row) => total + row.scheduledCandidates, 0);
    const cost = venue.installations.reduce((total, row) => total + row.localVendorCost, 0);
    const vendorIds = [...new Set(venue.installations.map(row => row.vendorId))];
    return {
      ...venue,
      days: new Set(schedule.map(row => row.examDate)).size,
      candidates,
      cost,
      perCandidate: safeDiv(cost, candidates),
      vendors: vendorIds,
    };
  }).sort((left, right) => left.zone.localeCompare(right.zone) || left.state.localeCompare(right.state) || left.tcCode.localeCompare(right.tcCode));

  const currentPage = Math.min(page, Math.max(1, Math.ceil(venues.length / PAGE_SIZE)));
  const pageRows = venues.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedVenue = selected ? venues.find(venue => venue.key === selected.key) : undefined;
  const detailPageCount = selectedVenue ? Math.max(1, Math.ceil(selectedVenue.installations.length / PAGE_SIZE)) : 1;
  const currentDetailPage = Math.min(detailPage, detailPageCount);
  const detailInstallations = selectedVenue
    ? selectedVenue.installations.slice((currentDetailPage - 1) * PAGE_SIZE, currentDetailPage * PAGE_SIZE)
    : [];

  const metricButton = (venue: VenueSummary, metric: VenueMetric, content: ReactNode) => (
    <button type="button" className="font-medium text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
      onClick={() => { setSelected({ key: venue.key, metric }); setDetailPage(1); }}
      aria-label={`Show ${metric} details for ${venue.tcCode}`}>
      {content}
    </button>
  );

  if (selectedVenue && selected) {
    const label: Record<VenueMetric, string> = {
      days: 'Temporary CCTV days',
      candidates: 'Scheduled candidates',
      cost: 'Cost incurred',
      perCandidate: 'Cost per candidate',
      vendors: 'Vendors assigned',
    };
    const vendorDetails = selected.metric === 'vendors'
      ? selectedVenue.vendors.map(vendorId => {
        const vendor = data.vendors.find(row => row.id === vendorId);
        const installations = selectedVenue.installations.filter(row => row.vendorId === vendorId);
        return {
          vendorId: vendor?.vendorCode || vendorId,
          name: vendor?.vendorName || 'Unknown vendor',
          installations: installations.length,
          cost: installations.reduce((total, row) => total + row.localVendorCost, 0),
          candidates: installations.reduce((total, installation) =>
            total + data.examDates.filter(row => row.installationRecordId === installation.id)
              .reduce((sum, row) => sum + row.scheduledCandidates, 0), 0),
        };
      })
      : [];

    return (
      <div>
        <GlobalFilters />
        <Button variant="ghost" size="sm" className="mb-3" onClick={() => setSelected(null)}><ArrowLeft size={14} /> Back to Venue Dashboard</Button>
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">{selectedVenue.tcName} <span className="font-mono text-base text-gray-500">({selectedVenue.tcCode})</span></h1>
          <p className="text-sm text-gray-500">{selectedVenue.zone} · {selectedVenue.state} · {label[selected.metric]}</p>
        </div>
        {selected.metric === 'vendors' ? (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <SortableTable className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
                {['Vendor ID', 'Vendor Name', 'Installations', 'Candidates', 'Cost Incurred'].map(heading => <th key={heading} className="px-4 py-3">{heading}</th>)}
              </tr></thead>
              <tbody>{vendorDetails.map(vendor => (
                <tr key={vendor.vendorId} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{vendor.vendorId}</td>
                  <td className="px-4 py-3">{vendor.name}</td>
                  <td className="px-4 py-3">{vendor.installations}</td>
                  <td className="px-4 py-3">{vendor.candidates.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><CostValue amount={vendor.cost} /></td>
                </tr>
              ))}</tbody>
            </SortableTable>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <SortableTable className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-600">
                {['Client', 'Exam', 'Vendor ID', 'Vendor', 'Exam Dates', 'CCTV Days', 'Candidates', 'Cost Incurred', 'Per Candidate'].map(heading => <th key={heading} className="px-3 py-3">{heading}</th>)}
              </tr></thead>
              <tbody>{detailInstallations.map(installation => {
                const requirement = data.requirements.find(row => row.id === installation.requirementId);
                const vendor = data.vendors.find(row => row.id === installation.vendorId);
                const dates = data.examDates.filter(row => row.installationRecordId === installation.id);
                const candidates = dates.reduce((total, row) => total + row.scheduledCandidates, 0);
                return (
                  <tr key={installation.id} className="border-t">
                    <td className="px-3 py-3">{requirement?.clientName}</td>
                    <td className="px-3 py-3">{requirement?.examName}</td>
                    <td className="px-3 py-3 font-mono text-xs">{vendor?.vendorCode || installation.vendorId}</td>
                    <td className="px-3 py-3">{vendor?.vendorName || 'Unknown vendor'}</td>
                    <td className="px-3 py-3 text-xs">{[...new Set(dates.map(row => row.examDate))].sort().join(', ')}</td>
                    <td className="px-3 py-3">{new Set(dates.map(row => row.examDate)).size}</td>
                    <td className="px-3 py-3">{candidates.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3"><CostValue amount={installation.localVendorCost} /></td>
                    <td className="px-3 py-3"><CostValue amount={safeDiv(installation.localVendorCost, candidates)} /></td>
                  </tr>
                );
              })}</tbody>
            </SortableTable>
            <TablePagination page={currentDetailPage} pageSize={PAGE_SIZE} totalItems={selectedVenue.installations.length} onPageChange={setDetailPage} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <GlobalFilters />
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Venue performance</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Venue Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Select a metric to inspect the venue’s underlying schedules and costs.</p>
        </div>
        {selected && <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close details <ChevronUp size={14} /></Button>}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <SortableTable className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
            {['Zone', 'State', 'TC Code', 'TC Name', 'Temporary CCTV Days', 'Scheduled Candidates', 'Cost Incurred', 'Cost per Candidate', 'Vendors'].map(heading => (
              <th key={heading} className="whitespace-nowrap px-3 py-3">{heading}</th>
            ))}
          </tr></thead>
          <tbody>
            {pageRows.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No venue data for the selected filters.</td></tr>
              : pageRows.map(venue => (
                <tr key={venue.key} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-3">{venue.zone}</td>
                  <td className="px-3 py-3">{venue.state}</td>
                  <td className="px-3 py-3 font-mono text-xs">{venue.tcCode}</td>
                  <td className="px-3 py-3 font-medium">{venue.tcName}</td>
                  <td className="px-3 py-3">{metricButton(venue, 'days', venue.days)} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'candidates', venue.candidates.toLocaleString('en-IN'))} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'cost', <CostValue amount={venue.cost} />)} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'perCandidate', <CostValue amount={venue.perCandidate} />)} <ChevronDown size={12} className="inline text-blue-500" /></td>
                  <td className="px-3 py-3">{metricButton(venue, 'vendors', venue.vendors.length)} <ChevronDown size={12} className="inline text-blue-500" /></td>
                </tr>
              ))}
          </tbody>
        </SortableTable>
        <TablePagination page={currentPage} pageSize={PAGE_SIZE} totalItems={venues.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
