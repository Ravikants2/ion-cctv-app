import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { Input, Select } from '../ui/FormFields';
import { Button } from '../ui/Button';

export function GlobalFilters() {
  const { data } = useAuth();
  const { filters, setFilters, clearFilters } = useFilters();

  const clients = [...new Set(data.requirements.map(r => r.clientName))].sort();
  const exams = [...new Set(
    data.requirements
      .filter(r => !filters.client || r.clientName === filters.client)
      .map(r => r.examName)
  )].sort();
  const zones = [...new Set(data.requirements.map(r => r.zone))].sort();

  return (
    <div className="bg-white border rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        <Input
          label="Start Date"
          type="date"
          value={filters.startDate}
          onChange={e => setFilters({ ...filters, startDate: e.target.value })}
          className="w-36"
        />
        <Input
          label="End Date"
          type="date"
          value={filters.endDate}
          onChange={e => setFilters({ ...filters, endDate: e.target.value })}
          className="w-36"
        />
        <Select
          label="Client"
          value={filters.client}
          onChange={e => setFilters({ ...filters, client: e.target.value, exam: '' })}
          options={clients.map(c => ({ value: c, label: c }))}
          placeholder="All Clients"
          className="w-44"
        />
        <Select
          label="Exam"
          value={filters.exam}
          onChange={e => setFilters({ ...filters, exam: e.target.value })}
          options={exams.map(e => ({ value: e, label: e }))}
          placeholder="All Exams"
          className="w-44"
        />
        <Select
          label="Zone"
          value={filters.zone}
          onChange={e => setFilters({ ...filters, zone: e.target.value })}
          options={zones.map(z => ({ value: z, label: z }))}
          placeholder="All Zones"
          className="w-36"
        />
        <Button variant="secondary" size="sm" onClick={clearFilters}>Clear</Button>
      </div>
    </div>
  );
}
