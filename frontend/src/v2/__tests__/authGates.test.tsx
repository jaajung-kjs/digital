/**
 * 인증 게이트(RequireAuth / LoginRoute) 테스트 — App.tsx 실제 export 검증
 *
 * 핵심 시나리오(리뷰 MAJOR): 만료 세션 무한 리다이렉트 루프 방지.
 * refresh 만료 → httpClient 가 토큰만 삭제, zustand persist 'auth-storage' 에는
 * isAuthenticated:true 잔존. 이 상태에서 /login 폼에 도달해야 한다(바운스 금지).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { RequireAuth, LoginRoute } from '../../App';
import { useV2AuthStore } from '../authStore';
import { tokenStorage } from '../httpClient';

beforeEach(() => {
  localStorage.clear();
  useV2AuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
});

function renderRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <RequireAuth>
              <Outlet />
            </RequireAuth>
          }
        >
          <Route path="/" element={<div>WORKSPACE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('만료 세션 (persisted 인증 + 토큰 없음)', () => {
  it('/ 진입 → 스토어 리셋 → /login 폼 도달, 워크스페이스 미노출 (루프 없음)', async () => {
    // httpClient 가 refresh 실패로 토큰을 지운 뒤의 상태 재현:
    // localStorage 에 토큰 없음 + persist 는 인증 상태 잔존
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });
    expect(tokenStorage.getAccessToken()).toBeNull();

    renderRoutes('/');

    // RequireAuth 의 no-token 경로가 fetchCurrentUser → initialState 리셋
    // → /login 으로 정착, LoginRoute 는 토큰 없으므로 폼을 렌더
    expect(await screen.findByRole('button', { name: /접속/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();

    // 스토어도 정합화됨
    await waitFor(() => {
      expect(useV2AuthStore.getState().isAuthenticated).toBe(false);
      expect(useV2AuthStore.getState().user).toBeNull();
    });
  });

  it('/login 직접 진입 → 바운스 없이 폼 렌더', async () => {
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });
    // 토큰 없음 → LoginRoute 는 리다이렉트하지 않고 폼을 보여준다
    renderRoutes('/login');

    expect(await screen.findByRole('button', { name: /접속/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
  });
});

describe('정상 세션 (인증 + 토큰 보유)', () => {
  it('/login 진입 → / 로 리다이렉트되어 워크스페이스 렌더', async () => {
    tokenStorage.setAccessToken('valid-access');
    tokenStorage.setRefreshToken('valid-refresh');
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });

    renderRoutes('/login');

    expect(await screen.findByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /접속/ })).not.toBeInTheDocument();
  });

  it('/ 진입 → 워크스페이스 렌더 유지', async () => {
    tokenStorage.setAccessToken('valid-access');
    tokenStorage.setRefreshToken('valid-refresh');
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });

    renderRoutes('/');

    expect(await screen.findByText('WORKSPACE')).toBeInTheDocument();
  });
});

describe('완전 미인증', () => {
  it('/ 진입 → /login 폼으로 리다이렉트', async () => {
    renderRoutes('/');
    expect(await screen.findByRole('button', { name: /접속/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
  });
});
