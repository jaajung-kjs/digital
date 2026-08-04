/**
 * 전역 알림(현재는 오류 한 줄) — mutation 실패가 화면에 남도록 하는 최소 표면.
 *
 * 왜 필요했나: 조직·카탈로그 변경은 react-query mutation 인데 12개 전부 onSuccess
 * 만 갖고 onError 가 없었다. 그래서 서버가 409 HAS_CHILDREN / DUPLICATE_KEY /
 * TYPE_IN_USE 같은 **구체적이고 실행 가능한 메시지**를 돌려줘도 화면에는 아무 일도
 * 일어나지 않았다(사용자에겐 "클릭이 씹힌" 것으로 보인다).
 *
 * 표시 문구 번역은 apiErrorMessage(단일 지점)가 하고, 이 스토어는 그 결과를 담기만
 * 한다 — 여기서 err.response 를 다시 읽지 않는다.
 */
import { create } from 'zustand';

interface NoticeState {
  error: string | null;
  showError: (message: string) => void;
  clearError: () => void;
}

export const useV2Notice = create<NoticeState>((set) => ({
  error: null,
  showError: (message) => set({ error: message }),
  clearError: () => set({ error: null }),
}));
