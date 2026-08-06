/**
 * 전역 알림 — mutation 결과가 화면에 남도록 하는 최소 표면.
 *
 * 왜 필요했나: 조직·카탈로그 변경은 react-query mutation 인데 12개 전부 onSuccess
 * 만 갖고 onError 가 없었다. 그래서 서버가 409 HAS_CHILDREN / DUPLICATE_KEY /
 * TYPE_IN_USE 같은 **구체적이고 실행 가능한 메시지**를 돌려줘도 화면에는 아무 일도
 * 일어나지 않았다(사용자에겐 "클릭이 씹힌" 것으로 보인다).
 *
 * 성공도 같은 자리에 남긴다: 저장이 끝나면 저장 바가 사라질 뿐이라 **정말 저장됐는지**
 * 확인할 방법이 없었다. 성공은 잠시 뒤 스스로 사라지고(읽고 나면 할 일이 없다),
 * 오류는 사용자가 닫을 때까지 남는다(조치가 필요하다).
 *
 * 표시 문구 번역은 apiErrorMessage(단일 지점)가 하고, 이 스토어는 그 결과를 담기만
 * 한다 — 여기서 err.response 를 다시 읽지 않는다.
 */
import { create } from 'zustand';

/** 성공 알림이 스스로 사라지기까지(ms). */
const SUCCESS_TTL = 3000;

interface NoticeState {
  error: string | null;
  success: string | null;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  clearError: () => void;
  clearSuccess: () => void;
}

let successTimer: ReturnType<typeof setTimeout> | null = null;

export const useV2Notice = create<NoticeState>((set) => ({
  error: null,
  success: null,
  showError: (message) => set({ error: message }),
  showSuccess: (message) => {
    if (successTimer) clearTimeout(successTimer);
    set({ success: message });
    successTimer = setTimeout(() => set({ success: null }), SUCCESS_TTL);
  },
  clearError: () => set({ error: null }),
  clearSuccess: () => {
    if (successTimer) clearTimeout(successTimer);
    set({ success: null });
  },
}));
