import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useV2AuthStore } from './v2/store/authStore';
import { V2Shell } from './v2/V2Shell';
import V2LoginPage from './v2/pages/V2LoginPage';
import V2WorkspacePage from './v2/pages/V2WorkspacePage';
import V2EquipmentTypesPage from './v2/pages/V2EquipmentTypesPage';
import V2CableTypesPage from './v2/pages/V2CableTypesPage';
import V2StandardsPage from './v2/pages/V2StandardsPage';
import { queryClient } from './lib/queryClient';

/**
 * 인증 게이트 — v2 authStore 기반 (B-V2 시정: 단일 파생 술어)
 *
 * "세션이 유효한가"는 authStore.hasValidSession() 하나만 읽는다(토큰 존재 ∧
 * persist 인증 상태). 불일치 정합(토큰 없는데 persist 만 인증 상태로 남은 만료
 * 세션 등)은 게이트가 아니라 스토어의 fetchCurrentUser/resetSession 경로에서만
 * 일어난다 — 이 컴포넌트는 마운트 시 fetchCurrentUser 를 무조건 1회 호출해
 * (a) 토큰만 있고 user 가 없으면 /me 로 복원, (b) 토큰이 없으면 리셋, (c) 이미
 * 복원돼 있으면 아무 것도 하지 않게 위임할 뿐, 조건 자체를 여기서 재기술하지 않는다.
 * hasValidSession() 은 실제 토큰 존재 여부를 직접 확인하므로, 리셋이 비동기로
 * 끝나기 전에도(만료 세션) 첫 렌더부터 정확히 false 를 반환해 루프 없이 /login
 * 으로 내비게이트한다.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const hasValidSession = useV2AuthStore((s) => s.hasValidSession());
  const isLoading = useV2AuthStore((s) => s.isLoading);
  const fetchCurrentUser = useV2AuthStore((s) => s.fetchCurrentUser);

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (isLoading) return null;

  if (!hasValidSession) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * /login 게이트 — hasValidSession() 하나만 읽는다(RequireAuth 와 동일한 유일
 * 술어). persist 만 남은 만료 세션은 토큰이 없으므로 술어가 false → 폼을 보여준다
 * (루프 방지).
 */
export function LoginRoute() {
  const hasValidSession = useV2AuthStore((s) => s.hasValidSession());
  if (hasValidSession) {
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
            {/* 보고 있는 자리는 주소가 안다 — `useWorkspaceRoute` 참고. */}
            <Route path="/n/:nodeId" element={<V2WorkspacePage />} />
            <Route path="/equipment-types" element={<V2EquipmentTypesPage />} />
            <Route path="/cable-types" element={<V2CableTypesPage />} />
            <Route path="/standards" element={<V2StandardsPage />} />
          </Route>

          {/* 구 /v2 경로 호환 리다이렉트 */}
          <Route path="/v2" element={<Navigate to="/" replace />} />
          {/* 대장이 셋으로 갈렸다 — 옛 주소는 첫 대장으로 보낸다. */}
          <Route path="/catalog" element={<Navigate to="/equipment-types" replace />} />
          <Route path="/v2/catalog" element={<Navigate to="/equipment-types" replace />} />
          <Route path="/assemblies" element={<Navigate to="/equipment-types" replace />} />
          <Route path="/assets" element={<Navigate to="/equipment-types" replace />} />
          <Route path="/cables" element={<Navigate to="/equipment-types" replace />} />

          {/* 기타 → 루트 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
