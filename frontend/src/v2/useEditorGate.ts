import { useEffect, useState } from 'react';

/**
 * **저장이 막혔을 때 무슨 일이 일어나는가** — 대장 세 탭이 같은 답을 쓰게 하는 한 곳.
 *
 * 같은 규칙을 탭마다 손으로 적고 있었고, 그래서 셋이 달랐다:
 * 장비 품목·설비 품목은 저장을 누르면 막는 칸을 켜 주는데(`revealIssues`), 케이블 품목은
 * 그 상태 자체가 없어 **저장 단추가 회색인 채 왜인지 말해 주지 않았다**. 문구도 두 곳에
 * 따로 적혀 있어 한쪽만 고쳐질 수 있었다.
 *
 * 규칙은 하나다: **막혔다고 단추를 꺼 두지 않는다.** 누르면 막고 있는 칸을 전부 짚어 준다
 * (GOV.UK·Nielsen). 회색 단추는 왜 안 눌리는지 말해 주지 못해 막다른 길이 된다.
 */
export function useEditorGate({
  issueCount,
  resetKey,
  onSave,
}: {
  /** 저장을 막는 입력 오류 수. */
  issueCount: number;
  /** 편집 대상이 바뀌면 다시 잠근다 — 저기서 막혔던 표시를 여기 들고 오지 않는다. */
  resetKey: string | null;
  onSave: () => void | Promise<void>;
}) {
  const [showIssues, setShowIssues] = useState(false);
  useEffect(() => setShowIssues(false), [resetKey]);

  return {
    /** 폼 전체의 검증 문구를 켤 것인가 — `IssueReveal.Provider` 에 그대로 넘긴다. */
    showIssues,
    /** 막혔을 때 띄울 한 줄. 막히지 않았으면 `null`. */
    blockedMessage:
      showIssues && issueCount > 0 ? `입력 오류가 있습니다 (${issueCount}건) — 붉게 표시된 칸을 확인하세요` : null,
    save: () => {
      if (issueCount > 0) {
        setShowIssues(true);
        return;
      }
      setShowIssues(false);
      void onSave();
    },
  };
}
