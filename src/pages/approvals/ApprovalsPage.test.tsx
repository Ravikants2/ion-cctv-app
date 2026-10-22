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

    expect(screen.getByText('Test Venue', { selector: 'td' })).toBeInTheDocument();
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

    const codeCell = screen.getByText('TC-100', { selector: 'button' }).closest('td');
    expect(codeCell?.nextElementSibling).toHaveTextContent('Test Venue');
    expect(screen.getByText('30 Aug 2026')).toBeInTheDocument();
    expect(screen.queryByText(/46264/)).not.toBeInTheDocument();
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

    expect(screen.getByText('6', { selector: 'td' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Past costs/ }));

    const details = within(screen.getByRole('dialog'));
    expect(details.getByText('Total recorded cost till now').parentElement).toHaveTextContent('₹20,500');
    expect(details.getByText('Cost per candidate till now').parentElement).toHaveTextContent('₹20.5');
    expect(details.getByText('Temporary CCTV days').parentElement).toHaveTextContent('6');
    expect(details.getByText('01 Dec 2025')).toBeInTheDocument();
    expect(details.getByText('05 Dec 2025')).toBeInTheDocument();
  });
});
