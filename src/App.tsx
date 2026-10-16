import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FilterProvider } from './context/FilterContext';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/ui/index';
import LoginPage from './pages/LoginPage';
import RequirementsPage from './pages/requirements/RequirementsPage';
import VendorsPage from './pages/vendors/VendorsPage';
import RecordsPage from './pages/records/RecordsPage';
import InstallationFormPage from './pages/installation/InstallationFormPage';
import BulkUploadPage from './pages/installation/BulkUploadPage';
import ExecutiveDashboard from './pages/dashboard/ExecutiveDashboard';
import FinancialDashboard from './pages/dashboard/FinancialDashboard';
import OperationsDashboard from './pages/dashboard/OperationsDashboard';
import VendorDashboard from './pages/dashboard/VendorDashboard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, syncStatus } = useAuth();
  if (syncStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center flex-col gap-4">
        <Spinner />
        <p className="text-white/60 text-sm">Loading data from GitHub…</p>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { currentUser, syncStatus } = useAuth();

  if (syncStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#0d1b3e] flex items-center justify-center flex-col gap-4">
        <Spinner />
        <p className="text-white/60 text-sm">Loading data from GitHub…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/dashboard/executive" replace /> : <LoginPage />} />
      <Route path="/dashboard/executive"  element={<ProtectedRoute><ExecutiveDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/financial"  element={<ProtectedRoute><FinancialDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/operations" element={<ProtectedRoute><OperationsDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/vendor"     element={<ProtectedRoute><VendorDashboard /></ProtectedRoute>} />
      <Route path="/requirements"         element={<ProtectedRoute><RequirementsPage /></ProtectedRoute>} />
      <Route path="/vendors"              element={<ProtectedRoute><VendorsPage /></ProtectedRoute>} />
      <Route path="/records"              element={<ProtectedRoute><RecordsPage /></ProtectedRoute>} />
      <Route path="/installation/new"     element={<ProtectedRoute><InstallationFormPage /></ProtectedRoute>} />
      <Route path="/installation/edit/:id" element={<ProtectedRoute><InstallationFormPage /></ProtectedRoute>} />
      <Route path="/installation/bulk"    element={<ProtectedRoute><BulkUploadPage /></ProtectedRoute>} />
      <Route path="/"  element={<Navigate to="/dashboard/executive" replace />} />
      <Route path="*"  element={<Navigate to="/dashboard/executive" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <BrowserRouter basename="/ion-cctv-app">
          <AppRoutes />
        </BrowserRouter>
      </FilterProvider>
    </AuthProvider>
  );
}
