import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, LoginRequest, LoginResponse, ChangePasswordRequest } from '../types';
import { api, tokenStorage } from '../utils/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<LoginResponse>('/auth/login', credentials);
          const { accessToken, refreshToken, user } = response.data;

          tokenStorage.setAccessToken(accessToken);
          tokenStorage.setRefreshToken(refreshToken);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '로그인에 실패했습니다.';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // 로그아웃 실패해도 클라이언트는 로그아웃 처리
        } finally {
          tokenStorage.clearTokens();
          set(initialState);
        }
      },

      changePassword: async (data: ChangePasswordRequest) => {
        set({ isLoading: true, error: null });
        try {
          await api.put('/auth/password', data);
          set({ isLoading: false });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.';
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      fetchCurrentUser: async () => {
        const token = tokenStorage.getAccessToken();
        if (!token) {
          set(initialState);
          return;
        }

        set({ isLoading: true });
        try {
          const response = await api.get<{ user: User }>('/auth/me');
          set({
            user: response.data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          tokenStorage.clearTokens();
          set(initialState);
        }
      },

      clearError: () => set({ error: null }),

      reset: () => {
        tokenStorage.clearTokens();
        set(initialState);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// 권한 체크 헬퍼
export const useIsAdmin = () => {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'ADMIN';
};
