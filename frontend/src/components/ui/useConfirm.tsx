import { useCallback, useRef, useState } from 'react';
import { ConfirmModal } from './ConfirmModal';

interface ConfirmOptions {
  title: string;
  /** 무엇을 두고 묻는가 — 그 하나의 이름(`ConfirmModal` 참고). 대상이 없으면 `null`. */
  target: string | null;
  message: React.ReactNode;
  /** 확인 버튼 문구. 삭제면 '삭제' 처럼 동사를 쓴다 — '확인' 보다 결과가 분명하다. */
  confirmLabel?: string;
  /** 물리는 단추 문구 — 기본 「취소」(`ConfirmModal`). */
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * 프로미스 기반 확인 대화상자 — `window.confirm` 을 **호출 형태 그대로** 대체한다.
 *
 *     if (!(await confirm({ title: '삭제', target: name, message: '…', danger: true }))) return;
 *
 * 왜 이 형태인가: 기존 코드는 전부 `if (!window.confirm(msg)) return;` 로 **동기 분기**
 * 였다. 각 호출부를 "모달 열기 → 콜백에서 계속"으로 뜯어고치면 변경이 커지고, 특히
 * 화면 이동 가드(저장 안 한 변경이 있을 때)는 흐름이 갈라져 버그가 나기 쉽다.
 * 프로미스를 돌려주면 `await` 한 줄만 붙이면 되고 나머지 흐름이 그대로 남는다.
 *
 * 사용하는 컴포넌트가 `{confirmDialog}` 를 렌더해야 한다(전역 프로바이더를 두지 않는다 —
 * 이 앱에는 확인 대화상자를 띄우는 화면이 몇 개뿐이라 전역 상태가 과하다).
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  // 닫힘 경로는 하나다 — 확인/취소/ESC/백드롭 전부 여기로 온다.
  // 미해결 프로미스가 남으면 호출부가 영원히 await 하므로 반드시 resolve 한다.
  const settle = useCallback((ok: boolean) => {
    setOptions(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  const confirmDialog = options && (
    <ConfirmModal
      open
      title={options.title}
      target={options.target}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      danger={options.danger}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}
