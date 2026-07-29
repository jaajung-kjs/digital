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
 * 토큰 없는데 persist 는 인증 상태(만료 세션: httpClient 가 토큰만 삭제)면
 * fetchCurrentUser 의 no-token 경로가 스토어를 initialState 로 리셋 →
 * persist 정합화 후 /login 으로 정착 (무한 리다이렉트 루프 방지)
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useV2AuthStore((s) => s.isAuthenticated);
  const isLoading = useV2AuthStore((s) => s.isLoading);
  const fetchCurrentUser = useV2AuthStore((s) => s.fetchCurrentUser);
  const user = useV2AuthStore((s) => s.user);

  useEffect(() => {
    const token = tokenStorage.getAccessToken();
    if (token && !user) {
      void fetchCurrentUser();
    } else if (!token && isAuthenticated) {
      // 만료 세션: 토큰은 지워졌는데 persist 가 인증 상태로 남음 — 리셋
      void fetchCurrentUser();
    }
  }, [fetchCurrentUser, user, isAuthenticated]);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * /login 게이트 — 인증 상태 + 실제 토큰 보유 시에만 / 로 리다이렉트
 * (persist 만 남은 만료 세션은 로그인 폼을 보여준다 — 루프 방지)
 */
export function LoginRoute() {
  const isAuthenticated = useV2AuthStore((s) => s.isAuthenticated);
  if (isAuthenticated && tokenStorage.getAccessToken()) {
    return <Navigate to="/" replace />;
  }
  return <V2LoginPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* 공개 — 이미 인증 시 / 로 */}
          <Route path="/login" element={<LoginRoute />} />

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
