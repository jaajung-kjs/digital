import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **저장한 것과 저장 안 한 것은 사용자에게 같은 것이다.**
 *
 * 워킹카피는 「저장하면 이렇게 된다」는 그림이고, 저장은 그 그림을 서버로 보내는 일일 뿐이다.
 * 그러니 화면은 「이건 아직 서버에 없다」로 갈라서면 안 된다 — 갈라 적는 순간 그 자리마다
 * 예외가 생기고, 사용자는 「저장해야 되는 일」과 「안 해도 되는 일」을 외워야 한다.
 *
 * 실제로 그런 줄 하나가 케이블을 막았다: 도면이 이을 수 있는 설비를 고를 때 `updatedAt !== ''`
 * 로 저장된 것만 셌고, 방금 놓은 설비는 흐리게 그려져 눌리지 않았다. 같은 자산의 포트 탭은
 * 「이을 수 있습니다」라고 적고 있었는데도. 그 줄은 옛 사실(서버가 포트를 만들던 시절)을
 * 옮겨 적은 것이었고, 사실이 바뀐 뒤에도 조건만 남아 있었다.
 *
 * 그래서 **그 모양의 조건을 아예 못 쓰게 한다.** 저장 여부가 필요한 자리는 스토어 안(커밋
 * 페이로드·베이스 버전)뿐이다.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** 화면 코드 — 스토어(`v2/store`)와 시험은 뺀다. 저장 여부를 아는 곳은 거기뿐이다. */
function screenFiles(): string[] {
  const v2 = join(dirname(fileURLToPath(import.meta.url)), '..');
  return walk(v2).filter(
    (f) =>
      (f.endsWith('.ts') || f.endsWith('.tsx')) &&
      !f.includes('.test.') &&
      !f.includes(`${join('v2', 'store')}`),
  );
}

describe('저장 여부로 갈라서지 않는다', () => {
  /**
   * **합치는 일은 한 곳에서만 한다.**
   *
   * 「저장된 것 + 아직 저장 안 한 것」을 화면마다 손으로 합치고 있었다(아홉 파일에 스무 번).
   * 같은 규칙을 스무 번 적으면 한 곳이 어긋나도 아무도 모른다 — 도면만 제 나름의 조건을
   * 하나 더 걸고 있던 것이 바로 그 케이블 버그였다. 합치기는 `store/useWorkingCopy` 의
   * 훅들이 하고, 화면은 그것을 읽기만 한다.
   */
  it('화면이 워킹카피를 손으로 다시 합치지 않는다', () => {
    const files = screenFiles().filter((f) => !f.endsWith('reportSelectors.ts'));
    const offenders = files.filter((f) => /mergeEffective\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders, `손으로 합친 곳: ${offenders.join(', ')}`).toEqual([]);
  });

  it('화면 코드에 「아직 저장 안 됨」 분기가 없다', () => {
    const files = screenFiles();
    expect(files.length, '스캔 대상 0개 — 가드가 무력화된 상태다').toBeGreaterThan(0);

    /* 금지하는 모양: `updatedAt === ''` / `updatedAt !== ''` / `isTempId(...)`.
       셋 다 「서버가 아직 모르는 것」을 묻는 말이고, 화면이 그것으로 할 일을 바꾸면 안 된다. */
    const forbidden = /updatedAt\s*[!=]==\s*['"]{2}|isTempId\s*\(/;
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders, `저장 여부로 갈라선 곳: ${offenders.join(', ')}`).toEqual([]);
  });
});
