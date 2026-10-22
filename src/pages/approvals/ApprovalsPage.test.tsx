import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import ApprovalsPage from './ApprovalsPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const initialData: AppData = {
  users: [{
    id: 'approver-1', name: 'Surveillance Reviewer', email: 'surveillance@example.com',
    role: 'surveillance_head', passwordHash: 'hash',
  }],
  requirements: [{
    id: 'requirement-1', zone: 'East 1', state: 'State', city: 'City',
    tcCode: 'TC-100', tcName: 'Test Venue', clientName: 'Client', examName: 'Exam',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  vendors: [{
    id: 'vendor-1', zone: 'East 1', vendorName: 'Test Vendor',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  installations: [{
    id: 'installation-1', requirementId: 'requirement-1', installationType: 'Full Vendor',
    vendorId: 'vendor-1', cameraCount: 10, proxyProvided: false, internetProvided: false,
    storageProvided: false, localVendorCost: 12500, createdBy: 'user-1',
    createdAt: '2026-01-01', updatedBy: 'user-1', updatedAt: '2026-01-02',
    approvalStatus: 'pending', approvalStage: 'surveillance_head',
  }],
  examDates: [{
    id: 'date-1', installationRecordId: 'installation-1',
    examDate: '2026-02-01', scheduledCandidates: 500,
  }],
  quotations: [],
  quoteRevisions: [
    {
      id: 'revision-1', installationRecordId: 'installation-1', createdAt: '2026-01-01',
      createdBy: 'user-1', vendorId: 'vendor-1', localVendorCost: 10000,
      installationType: 'Full Vendor', cameraCount: 10, totalCandidates: 500,
      examDates: [{ examDate: '2026-02-01', scheduledCandidates: 500 }],
    },
    {
      id: 'revision-2', installationRecordId: 'installation-1', createdAt: '2026-01-02',
      createdBy: 'user-1', vendorId: 'vendor-1', localVendorCost: 12500,
      installationType: 'Full Vendor', cameraCount: 10, totalCandidates: 500,
      examDates: [{ examDate: '2026-02-01', scheduledCandidates: 500 }],
    },
  ],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [],
};

describe('ApprovalsPage', () => {
  let mockData = initialData;
  let updatedData: AppData | undefined;
  let updateData: (updater: (previous: AppData) => AppData) => void;

  beforeEach(() => {
    vi.unstubAllGlobals();
    mockData = initialData;
    updatedData = undefined;
    updateData = vi.fn((updater: (previous: AppData) => AppData) => {
      updatedData = updater(mockData);
    });
    mockAuthData(mockData);
  });

  function mockAuthData(data: AppData) {
    vi.mocked(useAuth).mockReturnValue({
      currentUser: initialData.users[0],
      data,
      syncStatus: 'idle',
      syncError: '',
      isGitHub: false,
      login: () => false,
      logout: () => undefined,
      updateData,
      addAuditLog: vi.fn(),
      can: (action: string) => action === 'view_approvals' || action === 'approve_surveillance',
      reloadFromGitHub: async () => undefined,
    });
  }

  it('requires remarks for abnormal cost approval and advances to Head of Enablement', () => {
    render(<ApprovalsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Cost alert details for TC Code TC-100/ }));
    expect(screen.getByText(/Current quote increased 25% compared with its previous quote/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));

    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(screen.getByText(/Remarks are mandatory when approving a cost alert or exception/)).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Approval remarks for TC Code TC-100' }), {
      target: { value: 'Reviewed the increase against the updated venue setup.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Exception approval/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));

    expect(updatedData?.installations[0].approvalStatus).toBe('pending');
    expect(updatedData?.installations[0].approvalStage).toBe('enablement_head');
    expect(updatedData?.approvalEvents[0]).toMatchObject({
      action: 'approved',
      remarks: 'Reviewed the increase against the updated venue setup.',
      stage: 'surveillance_head',
      exception: true,
    });
  });

  it('requires a reason when sending a quote back to the zone', () => {
    render(<ApprovalsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Send back/ }));
    expect(screen.getByText('Remarks are mandatory when sending a quote back.')).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Approval remarks for TC Code TC-100' }), {
      target: { value: 'Please confirm the camera count and update the quote.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send back/ }));

    expect(updatedData?.installations[0].approvalStatus).toBe('returned');
    expect(updatedData?.installations[0].approvalStage).toBe('surveillance_head');
    expect(updatedData?.approvalEvents[0]).toMatchObject({
      action: 'sent_back',
      remarks: 'Please confirm the camera count and update the quote.',
    });
  });

  it('approves one venue at a time and requires remarks for cost discrepancies', () => {
    render(<ApprovalsPage />);

    expect(screen.getByText('Test Venue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));

    expect(screen.getByText(/Remarks are mandatory when approving a cost alert or exception/)).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Approval remarks for TC Code TC-100' }), {
      target: { value: 'Reviewed the venue increase against the updated scope.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(screen.getByText('Cost alerts require an explicit exception approval.')).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Exception approval/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));

    expect(updatedData?.installations[0].approvalStage).toBe('enablement_head');
    expect(updatedData?.approvalEvents[0]).toMatchObject({
      action: 'approved',
      remarks: 'Reviewed the venue increase against the updated scope.',
      stage: 'surveillance_head',
      exception: true,
    });
  });

  it('shows TC Name after TC Code and normalizes Excel serial exam dates', () => {
    mockData = {
      ...initialData,
      examDates: [{ ...initialData.examDates[0], examDate: '46264' }],
    };
    mockAuthData(mockData);

    render(<ApprovalsPage />);

    const venueCell = screen.getByText('TC TC-100').closest('td');
    expect(venueCell?.textContent?.indexOf('TC-100')).toBeLessThan(venueCell?.textContent?.indexOf('Test Venue') || 0);
    expect(screen.getByText('30/08/2026')).toBeInTheDocument();
    expect(screen.queryByText(/46264/)).not.toBeInTheDocument();
  });

  it('shows all exam dates together with one installation quote', () => {
    mockData = {
      ...initialData,
      examDates: [
        ...initialData.examDates,
        { id: 'date-2', installationRecordId: 'installation-1', examDate: '2026-02-02', scheduledCandidates: 300 },
      ],
    };
    mockAuthData(mockData);

    render(<ApprovalsPage />);

    const dateCell = screen.getByText('01/02/2026, 02/02/2026');
    expect(dateCell.closest('tr')).toHaveTextContent('₹12,500');
    expect(dateCell.closest('tr')).toHaveTextContent('800');
  });

  it('keeps the installation quote visible when exam-date details are missing', () => {
    mockData = { ...initialData, examDates: [] };
    mockAuthData(mockData);

    render(<ApprovalsPage />);

    expect(screen.getAllByText('₹12,500', { selector: 'td' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('shows all temporary CCTV days and aggregates recorded cost across venue installations', () => {
    const pastInstallation = {
      ...initialData.installations[0],
      id: 'past-installation',
      localVendorCost: 8000,
      createdAt: '2025-12-01',
      updatedAt: '2025-12-02',
      approvalStatus: 'approved' as const,
      approvalStage: undefined,
    };
    mockData = {
      ...initialData,
      installations: [...initialData.installations, pastInstallation],
      examDates: [
        ...initialData.examDates,
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `past-date-${index + 1}`,
          installationRecordId: pastInstallation.id,
          examDate: `2025-12-0${index + 1}`,
          scheduledCandidates: 100,
        })),
      ],
    };
    mockAuthData(mockData);

    render(<ApprovalsPage />);

    expect(screen.getByText('6 days', { selector: 'p' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View history/ }));

    const details = within(screen.getByRole('dialog'));
    expect(details.getByText('Total recorded cost till now').parentElement).toHaveTextContent('₹20,500');
    expect(details.getByText('Cost per candidate till now').parentElement).toHaveTextContent('₹20.5');
    expect(details.getByText('Temporary CCTV days').parentElement).toHaveTextContent('6');
    expect(details.getByText('01/12/2025, 02/12/2025, 03/12/2025, 04/12/2025, 05/12/2025')).toBeInTheDocument();
  });

  it('paginates the approval queue', () => {
    const installations = Array.from({ length: 11 }, (_, index) => ({
      ...initialData.installations[0],
      id: `installation-${index + 1}`,
      updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}`,
    }));
    mockData = { ...initialData, installations };
    mockAuthData(mockData);

    render(<ApprovalsPage />);

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('confirms skipping flagged venues with missing remarks during bulk approval', () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const secondRequirement = {
      ...initialData.requirements[0],
      id: 'requirement-2',
      tcCode: 'TC-200',
      tcName: 'Second Venue',
      city: 'Other City',
    };
    const secondInstallation = {
      ...initialData.installations[0],
      id: 'installation-2',
      requirementId: secondRequirement.id,
      localVendorCost: 5000,
    };
    mockData = {
      ...initialData,
      requirements: [...initialData.requirements, secondRequirement],
      installations: [...initialData.installations, secondInstallation],
      examDates: [
        ...initialData.examDates,
        { id: 'date-2', installationRecordId: secondInstallation.id, examDate: '2026-02-01', scheduledCandidates: 5000 },
      ],
      quoteRevisions: [
        ...initialData.quoteRevisions,
        {
          ...initialData.quoteRevisions[1],
          id: 'revision-3',
          installationRecordId: secondInstallation.id,
          localVendorCost: 5000,
          totalCandidates: 5000,
        },
      ],
    };
    mockAuthData(mockData);

    render(<ApprovalsPage />);
    fireEvent.change(screen.getByLabelText('Client Name'), { target: { value: 'Client' } });
    fireEvent.change(screen.getByLabelText('Exam Name'), { target: { value: 'Exam' } });
    fireEvent.click(screen.getByLabelText('Select all matching TC venues'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve selected (2)' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Cost alert requires remarks and exception approval'));
    expect(updatedData?.installations.find(record => record.id === 'installation-1')?.approvalStage).toBe('surveillance_head');
    expect(updatedData?.installations.find(record => record.id === 'installation-2')?.approvalStage).toBe('enablement_head');
    expect(updatedData?.approvalEvents.map(event => event.installationRecordId)).toEqual(['installation-2']);
    expect(screen.getByText('1 venue approved; 1 skipped.')).toBeInTheDocument();
  });
});
