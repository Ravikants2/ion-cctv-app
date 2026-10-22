import { fireEvent, render, screen } from '@testing-library/react';
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
  auditLogs: [],
};

describe('ApprovalsPage', () => {
  let updatedData: AppData | undefined;
  let updateData: (updater: (previous: AppData) => AppData) => void;

  beforeEach(() => {
    updatedData = undefined;
    updateData = vi.fn((updater: (previous: AppData) => AppData) => {
      updatedData = updater(initialData);
    });
    vi.mocked(useAuth).mockReturnValue({
      currentUser: initialData.users[0],
      data: initialData,
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
  });

  it('requires remarks for abnormal cost approval and advances to Head of Enablement', () => {
    render(<ApprovalsPage />);

    expect(screen.getByText(/25% higher than the previous quote/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Approve and forward/ }));
    expect(screen.getByText(/Remarks are mandatory for an abnormal or exception approval/)).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Remarks' }), {
      target: { value: 'Reviewed the increase against the updated venue setup.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve and forward/ }));

    expect(updatedData?.installations[0].approvalStatus).toBe('pending');
    expect(updatedData?.installations[0].approvalStage).toBe('enablement_head');
    expect(updatedData?.approvalEvents[0]).toMatchObject({
      action: 'approved',
      remarks: 'Reviewed the increase against the updated venue setup.',
      stage: 'surveillance_head',
    });
  });

  it('requires a reason when sending a quote back to the zone', () => {
    render(<ApprovalsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Send back to zone/ }));
    expect(screen.getByText('Remarks are mandatory when sending a quote back.')).toBeInTheDocument();
    expect(updateData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Remarks' }), {
      target: { value: 'Please confirm the camera count and update the quote.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send back to zone/ }));

    expect(updatedData?.installations[0].approvalStatus).toBe('returned');
    expect(updatedData?.installations[0].approvalStage).toBe('surveillance_head');
    expect(updatedData?.approvalEvents[0]).toMatchObject({
      action: 'sent_back',
      remarks: 'Please confirm the camera count and update the quote.',
    });
  });
});
