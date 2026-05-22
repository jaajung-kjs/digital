import { useToastStore } from '../stores/toastStore';

/**
 * 작업 완료 피드백 토스트. 우하단에 세로 스택으로 쌓이며, toastStore 가
 * 타이머로 자동 제거하므로 여기서는 렌더링과 수동 닫기만 담당한다.
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 flex flex-col gap-2"
      style={{ zIndex: 60 }}
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label={`닫기: ${toast.message}`}
          className={`text-left px-4 py-2 rounded-lg shadow-md text-sm font-medium text-white ${
            toast.type === 'error'
              ? 'bg-red-600'
              : toast.type === 'info'
                ? 'bg-gray-800'
                : 'bg-green-600'
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
