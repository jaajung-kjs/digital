/**
 * 인증 게이트(RequireAuth / LoginRoute) 테스트 — App.tsx 실제 export 검증
 *
 * 핵심 시나리오(리뷰 MAJOR): 만료 세션 무한 리다이렉트 루프 방지.
 * refresh 만료 → httpClient 가 토큰만 삭제, zustand persist 'auth-storage' 에는
 * isAuthenticated:true 잔존. 이 상태에서 /login 폼에 도달해야 한다(바운스 금지).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import { RequireAuth, LoginRoute } from '../../App';
import { useV2AuthStore } from '../store/authStore';
import { tokenStorage, invokeSessionInvalid } from '../httpClient';
import { returnPath } from '../pages/V2LoginPage';
import { workingCopyStore } from '../model/store/workingCopy';

beforeEach(() => {
  localStorage.clear();
  useV2AuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

function Where() {
  const l = useLocation();
  return <div>AT {l.pathname}{l.search}</div>;
}

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
          <Route path="/n/:nodeId" element={<Where />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('만료 세션 (persisted 인증 + 토큰 없음)', () => {
  it('/ 진입 → 스토어 리셋 → /login 폼 도달, 설비 관리 미노출 (루프 없음)', async () => {
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
    expect(await screen.findByRole('button', { name: /로그인/ })).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: /로그인/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
  });
});

describe('정상 세션 (인증 + 토큰 보유)', () => {
  it('/login 진입 → / 로 리다이렉트되어 설비 관리 렌더', async () => {
    tokenStorage.setAccessToken('valid-access');
    tokenStorage.setRefreshToken('valid-refresh');
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });

    renderRoutes('/login');

    expect(await screen.findByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /로그인/ })).not.toBeInTheDocument();
  });

  it('/ 진입 → 설비 관리 렌더 유지', async () => {
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
    expect(await screen.findByRole('button', { name: /로그인/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
  });
});

describe('httpClient 세션-무효 핸들러 → 게이트 연동 (B-V2)', () => {
  it('등록된 핸들러 호출(=refresh 실패 재현) → 스토어 리셋 → 하드 리로드 없이 로그인 폼 도달', async () => {
    tokenStorage.setAccessToken('valid-access');
    tokenStorage.setRefreshToken('valid-refresh');
    useV2AuthStore.setState({
      user: { id: 'u1', username: 'admin', role: 'admin' },
      isAuthenticated: true,
    });

    renderRoutes('/');
    expect(await screen.findByText('WORKSPACE')).toBeInTheDocument();

    const hrefBefore = window.location.href;

    // httpClient 인터셉터가 refresh 실패 시 하는 일을 그대로 재현: 토큰 삭제 후
    // 세션-무효 진입점 호출. authStore.ts 모듈 초기화가 등록한 실제 프로덕션
    // 핸들러가 이 안에서 불린다. window.location 은 건드리지 않는다(하드 리로드 없음).
    tokenStorage.clearTokens();
    act(() => {
      invokeSessionInvalid();
    });

    // React 재렌더만으로(페이지 이동 없이) 폼 도달
    expect(await screen.findByRole('button', { name: /로그인/ })).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE')).not.toBeInTheDocument();
    expect(window.location.href).toBe(hrefBefore);

    expect(useV2AuthStore.getState().isAuthenticated).toBe(false);
    expect(useV2AuthStore.getState().user).toBeNull();
  });
});

describe('딥 링크 — 로그인 뒤 가려던 자리로', () => {
  it('로그인 전에 연 /n/<국>?view=선번장 은 로그인 뒤 그 주소로 돌아온다', async () => {
    renderRoutes('/n/S1?view=선번장');
    expect(await screen.findByRole('button', { name: /로그인/ })).toBeInTheDocument();
    /* 로그인 성공(스토어가 하는 일)을 그대로 — 토큰 + 인증 상태. LoginRoute 가 돌려보낸다. */
    act(() => {
      tokenStorage.setAccessToken('valid-access');
      tokenStorage.setRefreshToken('valid-refresh');
      useV2AuthStore.setState({ user: { id: 'u1', username: 'admin', role: 'admin' }, isAuthenticated: true });
    });
    expect(await screen.findByText("AT /n/S1?view=선번장")).toBeInTheDocument();
  });

  it('returnPath — 앱 안의 경로만, /login 이나 바깥 주소는 첫 화면', () => {
    expect(returnPath({ from: { pathname: '/n/S1', search: '?eq=E1', hash: '' } })).toBe('/n/S1?eq=E1');
    expect(returnPath(null)).toBe('/');
    expect(returnPath({ from: { pathname: '/login' } })).toBe('/');
    expect(returnPath({ from: { pathname: '//evil.example' } })).toBe('/');
  });
});

describe('세션이 끊긴 뒤 다른 사용자가 들어오면 변경안을 비운다', () => {
  it('/me 로 복원한 사용자가 변경안의 주인과 다르면 reset', async () => {
    workingCopyStore.getState().reset();
    workingCopyStore.getState().claim('u-old');
    workingCopyStore.getState().create('racks', { id: 'r9', substationId: 'S', name: '랙', rackTypeId: 't', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    expect(workingCopyStore.getState().dirtyCount()).toBe(1);
    tokenStorage.setAccessToken('valid-access');
    useV2AuthStore.setState({ user: { id: 'u-new', username: 'other', role: 'admin' }, isAuthenticated: true });
    await useV2AuthStore.getState().fetchCurrentUser();
    expect(workingCopyStore.getState().dirtyCount()).toBe(0);
    expect(workingCopyStore.getState().owner).toBe('u-new');
  });
});
