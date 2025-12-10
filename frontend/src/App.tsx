import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SubstationsPage } from './pages/SubstationsPage';
import { FloorsPage } from './pages/FloorsPage';
import { FloorPlanEditorPage } from './pages/FloorPlanEditorPage';
import { RackEditorPage } from './pages/RackEditorPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { isAuthenticated, fetchCurrentUser } = useAuthStore();

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />

      {/* Protected Routes - Full screen pages (no Layout) */}
      <Route
        path="/floors/:floorId/plan"
        element={
          <ProtectedRoute>
            <FloorPlanEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/racks/:rackId"
        element={
          <ProtectedRoute>
            <RackEditorPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Routes - With Layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/substations" element={<SubstationsPage />} />
        <Route path="/substations/:substationId/floors" element={<FloorsPage />} />
        {/* <Route path="/users" element={<UsersPage />} /> */}
        {/* <Route path="/audit-logs" element={<AuditLogsPage />} /> */}
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
