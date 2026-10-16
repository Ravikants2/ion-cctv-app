export type Role = 'super_admin' | 'sub_admin' | 'user' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}

export interface RequirementMaster {
  id: string;
  zone: string;
  state: string;
  city: string;
  tcCode: string;
  tcName: string;
  clientName: string;
  examName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorMaster {
  id: string;
  zone: string;
  vendorName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type InstallationType = 'Full Vendor' | 'Partial Vendor';
export type StorageType = 'Pen Drive' | 'External HDD';
export type StorageUnit = 'GB' | 'TB';

export interface InstallationRecord {
  id: string;
  requirementId: string;
  installationType: InstallationType;
  vendorId: string;
  cameraCount: number;
  proxyProvided: boolean;
  internetProvided: boolean;
  storageProvided: boolean;
  storageType?: StorageType;
  storageQuantity?: number;
  storageSize?: number;
  storageUnit?: StorageUnit;
  localVendorCost: number;
  minimumCost?: number;
  remarks?: string;
  quotationFileId?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ExamDateDetail {
  id: string;
  installationRecordId: string;
  examDate: string;
  scheduledCandidates: number;
}

export interface QuotationFile {
  id: string;
  installationRecordId: string;
  originalFileName: string;
  dataUrl: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'LOGIN';

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  beforeJson?: string;
  afterJson?: string;
  timestamp: string;
}

export interface AppData {
  users: User[];
  requirements: RequirementMaster[];
  vendors: VendorMaster[];
  installations: InstallationRecord[];
  examDates: ExamDateDetail[];
  quotations: QuotationFile[];
  auditLogs: AuditLog[];
}

export interface DashboardFilters {
  startDate: string;
  endDate: string;
  client: string;
  exam: string;
  zone: string;
}
