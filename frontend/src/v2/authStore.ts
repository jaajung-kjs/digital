/**
 * v2 인증 스토어 (zustand persist)
 *
 * - persist 키: 'auth-storage' (구 authStore.ts 와 동일 — 기존 세션 호환)
 * - 엔드포인트: /api/v2/auth/*
 * - role: 소문자 문자열 'admin' | 'viewer'
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { httpClient, tokenStorage } from './httpClient';

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
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useV2AuthStore = create<AuthStore>()(
  persist(
    (set) => ({
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
          tokenStorage.clearTokens();
          set(initialState);
        }
      },

      fetchCurrentUser: async () => {
        if (!tokenStorage.getAccessToken()) {
          set(initialState);
          return;
        }

        set({ isLoading: true });
        try {
          const { data } = await httpClient.get<V2User>('/v2/auth/me');
          set({ user: data, isAuthenticated: true, isLoading: false });
        } catch {
          tokenStorage.clearTokens();
          set(initialState);
        }
      },
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

// 헬퍼: 역할 비교 함수로 캡슐화(가드레일: 직접 비교 패턴 금지)
const ADMIN_ROLE = 'admin';
export const isAdminRole = (userRole: string | undefined) => userRole === ADMIN_ROLE;
