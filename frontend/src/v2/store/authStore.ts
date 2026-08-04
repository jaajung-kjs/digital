/**
 * v2 인증 스토어 (zustand persist)
 *
 * - persist 키: 'auth-storage' (구 authStore.ts 와 동일 — 기존 세션 호환)
 * - 엔드포인트: /api/v2/auth/*
 * - role: 소문자 문자열 'admin' | 'viewer'
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { httpClient, tokenStorage, setSessionInvalidHandler } from '../httpClient';
import { setMutationErrorHandler } from '../../lib/queryClient';
import { apiErrorMessage } from '../apiError';
import { useV2Notice } from './noticeStore';

interface V2User {
  id: string;
  username: string;
  role: string; // 'admin' | 'viewer'
}

interface AuthState {
  user: V2User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  /** 토큰 삭제 + 스토어를 initialState 로 리셋 — 세션 무효화의 유일한 실행 지점. */
  resetSession: () => void;
  /**
   * "세션이 유효한가" 파생 술어 — 유일 지점(B-V2 시정).
   * 토큰 존재 ∧ persist 인증 상태. RequireAuth/LoginRoute 는 이 술어만 읽는다.
   * 불일치 정합(토큰 없는데 persist 만 인증 상태)은 fetchCurrentUser/resetSession
   * 경로에서만 일어난다 — 게이트는 판정만 하고 리셋하지 않는다.
   */
  hasValidSession: () => boolean;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useV2AuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async ({ username, password }) => {
        set({ isLoading: true });
        try {
          const { data } = await httpClient.post<{
            accessToken: string;
            refreshToken: string;
            user: V2User;
          }>('/v2/auth/login', { username, password });

          tokenStorage.setAccessToken(data.accessToken);
          tokenStorage.setRefreshToken(data.refreshToken);

          set({ user: data.user, isAuthenticated: true, isLoading: false });
        } catch (err) {
          // 표시용 메시지 추출은 apiError.ts 의 apiErrorMessage 가 유일 지점 —
          // 이 스토어는 세션 상태만 관리하고 호출부(V2LoginPage)가 catch 한다.
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        const refreshToken = tokenStorage.getRefreshToken();
        try {
          if (refreshToken) {
            await httpClient.post('/v2/auth/logout', { refreshToken });
          }
        } catch {
          // 클라이언트는 무조건 로그아웃 처리
        } finally {
          get().resetSession();
        }
      },

      fetchCurrentUser: async () => {
        if (!tokenStorage.getAccessToken()) {
          // 토큰 없음 — 정합화(reconcile): persist 에 인증 상태가 남아 있어도
          // (예: httpClient 가 refresh 실패로 토큰만 지운 직후) 여기서 리셋한다.
          // 이 분기가 스토어 내 유일한 reconcile 경로다(B-V2).
          get().resetSession();
          return;
        }

        if (get().user) {
          // 이미 세션이 복원돼 있음 — 마운트마다 /me 를 재호출하지 않는다.
          return;
        }

        set({ isLoading: true });
        try {
          const { data } = await httpClient.get<V2User>('/v2/auth/me');
          set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
          get().resetSession();
        }
      },

      resetSession: () => {
        tokenStorage.clearTokens();
        set(initialState);
      },

      hasValidSession: () => get().isAuthenticated && !!tokenStorage.getAccessToken(),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// ── httpClient 세션-무효 핸들러 등록 (앱 부트, B-V2 시정) ─────────────────────
// httpClient.ts 는 이 스토어를 import 하지 않는다(순환 방지 — 의존 방향은
// "authStore → httpClient" 단방향). 그래서 등록은 반대로, 이 스토어가 부트 시
// httpClient 에 콜백을 '주입'하는 형태로 이뤄진다.
// main.tsx 가 아니라 이 모듈 스코프에 두는 이유: App.tsx → RequireAuth/LoginRoute
// 가 이 모듈을 import 하는 순간(= 앱 부트, 라우팅보다 먼저) 정확히 1회 평가되면
// 충분하고, main.tsx 에 별도 부트 단계를 추가하면 "등록 지점"이 또 하나 늘어나
// 오히려 산재를 재현한다. refresh 실패 시 httpClient 는 토큰만 지우고 이 핸들러를
// 호출하며, 핸들러는 스토어를 initialState 로 리셋한다(하드 리로드 없이 재렌더
// 유도 — RequireAuth 가 hasValidSession() 로 감지해 /login 으로 내비게이트).
setSessionInvalidHandler(() => {
  useV2AuthStore.getState().resetSession();
});

// 헬퍼: 역할 비교 함수로 캡슐화(가드레일: 직접 비교 패턴 금지)
const ADMIN_ROLE = 'admin';
export const isAdminRole = (userRole: string | undefined) => userRole === ADMIN_ROLE;

// ── 전역 mutation 실패 → 알림 표면 (모듈 초기화 시 1회 등록) ──────────────────
// react-query 의 MutationCache 가 모든 mutation 실패를 여기로 보낸다.
// 문구 번역은 apiErrorMessage(단일 지점)가 하고, 여기서는 전달만 한다.
setMutationErrorHandler((err) => {
  useV2Notice.getState().showError(apiErrorMessage(err, '요청을 처리하지 못했습니다'));
});
