import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useV2AuthStore } from './v2/authStore';
import { tokenStorage } from './v2/httpClient';
import { V2Shell } from './v2/V2Shell';
import V2LoginPage from './v2/pages/V2LoginPage';
import V2WorkspacePage from './v2/pages/V2WorkspacePage';
import V2CatalogAdminPage from './v2/pages/V2CatalogAdminPage';
import { queryClient } from './lib/queryClient';

/**
 * 인증 게이트 — v2 authStore 기반
 * 미인증 → /login 리다이렉트
 * 토큰 있고 user 없으면 /me 복원 시도
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useV2AuthStore((s) => s.isAuthenticated);
  const isLoading = useV2AuthStore((s) => s.isLoading);
  const fetchCurrentUser = useV2AuthStore((s) => s.fetchCurrentUser);
  const user = useV2AuthStore((s) => s.user);

  useEffect(() => {
    if (tokenStorage.getAccessToken() && !user) {
      void fetchCurrentUser();
    }
  }, [fetchCurrentUser, user]);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* 공개 */}
          <Route path="/login" element={<V2LoginPage />} />

          {/* 인증 필요 — V2Shell 레이아웃 */}
          <Route
            element={
              <RequireAuth>
                <V2Shell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<V2WorkspacePage />} />
            <Route path="/catalog" element={<V2CatalogAdminPage />} />
          </Route>

          {/* 구 /v2 경로 호환 리다이렉트 */}
          <Route path="/v2" element={<Navigate to="/" replace />} />
          <Route path="/v2/catalog" element={<Navigate to="/catalog" replace />} />

          {/* 기타 → 루트 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
