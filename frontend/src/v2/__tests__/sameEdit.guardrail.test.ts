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

/**
 * **같은 일에는 문이 하나다.**
 *
 * 화면마다 문이 있어도(도면 · 포트 탭 · 대국 검색) 그 문 뒤에서 하는 일은 하나여야 한다.
 * 문마다 글을 따로 적으면 반드시 갈린다 — 실제로 갈렸다: 케이블을 도면에서는 **묻지도 않고**
 * 지웠는데 포트 탭에서는 물었고, 첫 끝점에 넣는 자산이 문마다 달라 미리보기가 한쪽에서만
 * 나왔다. 잇고 지우는 일은 `cableActions`·`deleteActions` 에서만 한다.
 */
describe('같은 일에는 문이 하나다', () => {
  const OWNERS: Record<string, string> = {
    'stageCableCreate': 'cableActions.ts',
    'stageCableDelete': 'deleteActions.ts',
    /* 분류는 설비 품목과 장비 품목이 **함께 쓰는 체계**다. 두 화면이 각자 적고 있었고,
       그래서 한쪽만 확인을 묻고 오류 문구도 갈렸다. 문은 상자 하나다. */
    'createCategory.mutateAsync': 'useCategoryAdmin.tsx',
    'patchCategory.mutateAsync': 'useCategoryAdmin.tsx',
    'deleteCategory.mutateAsync': 'useCategoryAdmin.tsx',
  };

  it('케이블을 잇고 지우는 일, 분류를 고치는 일은 그 한 곳에서만 한다', () => {
    const files = screenFiles();
    for (const [call, owner] of Object.entries(OWNERS)) {
      const offenders = files.filter(
        (f) => !f.endsWith(owner) && new RegExp(`\\.${call.replace('.', '\\.')}\\(`).test(readFileSync(f, 'utf8')),
      );
      expect(offenders, `${call} 을 ${owner} 밖에서 부른 곳: ${offenders.join(', ')}`).toEqual([]);
    }
  });
});

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

/**
 * **떠나기 전에 묻는 자리는 하나다.**
 *
 * 저장 안 한 것을 안고 창을 닫으려 하면 브라우저가 묻는다. 그 등록(`beforeunload`)을 화면마다
 * 두면, 새 화면이 생길 때마다 빠뜨린다 — 실제로 저장 바와 셸이 **각자** 등록하고 있었고,
 * 품목 세 탭은 셸의 것만으로 물어보고 있었다. 화면이 하는 일은 「안 저장된 것이 몇 건」인지
 * 손을 드는 것뿐이고(`useUnsavedMark`), 막는 일은 셸이 한다.
 */
describe('떠나기 전에 묻는 자리', () => {
  it('beforeunload 를 등록하는 곳은 셸 하나다', () => {
    const offenders = screenFiles().filter(
      (f) => !f.endsWith('V2Shell.tsx') && /addEventListener\('beforeunload'/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders, `셸 밖에서 beforeunload 를 등록한 곳: ${offenders.join(', ')}`).toEqual([]);
  });
});
