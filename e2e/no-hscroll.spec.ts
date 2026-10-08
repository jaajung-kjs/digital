import { expect, test, type Page } from '@playwright/test';
import { layoutProblems, login, openBranch, openStation } from './helpers';

/**
 * **판 안의 표는 가로로 구르지 않는다**(CONVENTIONS §1.7-e2) — 1280·1440 × 조직 트리 펼침/접힘 × 상세 레일 열림/닫힘에서
 * 보이는 표 상자마다 `scrollWidth <= clientWidth`. 표는 열 순위대로 병합·숨는다(`TableCard columns`).
 *
 * 스크롤만 보면 「잘림」이 스크롤을 대신해도 통과한다(실제로 그랬다 — 선번장 글 열이 80px 로 눌렸다). 그래서 같은 장면마다
 * `layoutProblems` 로 함께 단언한다: 선번장 글 열 최소 폭(`SHEET_TEXT_MIN`)·두 줄까지, 잘린 수 없음, 머리글 한 줄(측정 창 2단 머리 제외),
 * 상태표시줄 칸 겹침·잘림 없음.
 *
 * 읽기만 한다 — 설계서를 열려고 쌓은 변경 하나는 「변경 취소」로 물린다.
 */
const STATION = '(구)춘천S/S';
const SHEET_STATION = '북춘천S/S';
const PANEL = '통신용 분전반';
const RACK = 'ICT관제소 서버랙';
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 1440, height: 900 }] as const;

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');
/** 창 하나 — 띄운 채로 단언한다. */
async function dialogOk(page: Page, where: string) {
  await page.waitForTimeout(150);
  expect(await layoutProblems(page), where).toEqual([]);
}

/** 지금 화면 + 트리를 접은 화면 둘 다 넘치지 않는다. 트리는 펼친 채로 돌려놓는다. */
async function bothTrees(page: Page, where: string) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150); // 표 판 폭 단계(ResizeObserver)가 따라올 틈
  expect(await layoutProblems(page), `${where} · 트리 펼침`).toEqual([]);
  await page.getByRole('button', { name: '조직 접기' }).click();
  await expect(page.getByRole('button', { name: '조직 펼치기' })).toBeVisible();
  await page.waitForTimeout(150);
  expect(await layoutProblems(page), `${where} · 트리 접음`).toEqual([]);
  await page.getByRole('button', { name: '조직 펼치기' }).click();
  await expect(page.getByRole('button', { name: '조직 접기' })).toBeVisible();
}

for (const vp of VIEWPORTS) {
  test.describe(`가로 스크롤 없음 ${vp.width}`, () => {
    test.use({ viewport: vp });

    test('현황 · 전원 계통(대장·편집 창) · 평면도', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', STATION);

      // 현황 — 품목별(기본) · 품목별 + 상세 레일
      await expect(main(page).getByRole('row').nth(2)).toBeVisible();
      await expect(main(page).getByRole('radio', { name: '품목별' })).toBeChecked();
      await bothTrees(page, '현황');
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page)).toHaveCount(1);
      await bothTrees(page, '현황 품목별 + 상세');
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await bothTrees(page, '현황 + 상세');

      // 연결 추가 창(설비 상세 · 연결 탭)
      await detail(page).getByRole('tab', { name: '연결' }).click();
      await detail(page).getByRole('button', { name: '연결 추가', exact: true }).click();
      const linkAdd = page.getByRole('dialog', { name: '연결 추가' });
      await expect(linkAdd).toBeVisible();
      await dialogOk(page, '연결 추가 창');
      await linkAdd.getByRole('button', { name: '취소' }).click();
      await detail(page).getByRole('tab', { name: '정보' }).click();

      // 랙 상세 · 설비 추가 · 랙 추가 창
      await main(page).getByRole('row').filter({ hasText: RACK }).first().click();
      await expect(detail(page).locator('[data-detail-head]', { hasText: /^실장 설비\d+/ })).toBeVisible();
      await bothTrees(page, '랙 상세');
      await main(page).getByRole('button', { name: '설비 추가' }).first().click();
      const addEq = page.getByRole('dialog', { name: '설비 추가' });
      await expect(addEq).toBeVisible();
      await dialogOk(page, '설비 추가 창');
      await addEq.getByRole('button', { name: '취소' }).click();
      await main(page).getByRole('button', { name: '랙 추가' }).click();
      const addRackDlg = page.getByRole('dialog', { name: '랙 추가' });
      await expect(addRackDlg).toBeVisible();
      await dialogOk(page, '랙 추가 창');
      await addRackDlg.getByRole('button', { name: '취소' }).click();
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);

      // 차단기 편집 창 — 대장과 같은 열 선언, 전 열
      await detail(page).getByRole('button', { name: '차단기 수정', exact: true }).click();
      const editor = page.getByRole('dialog', { name: `차단기 — ${PANEL}` });
      await expect(editor.getByRole('columnheader')).toHaveText(['차단기', '표기', '교류/직류', '전압', '용량', '상', '개폐', '부하', '포트', '전원케이블', '길이(m)', '비고']);
      await dialogOk(page, '차단기 편집 창');
      await editor.getByRole('button', { name: '닫기' }).last().click();

      // 전원 계통 차단기 대장 — 레일 닫힘 · 열림
      await main(page).getByRole('tab', { name: '전원 계통' }).click();
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click().catch(() => undefined);
      const blocks = main(page).getByTestId('ledger-block');
      await expect(blocks.first()).toBeVisible();
      await expect(detail(page)).toHaveCount(0);
      await bothTrees(page, '차단기 대장');
      const head = blocks.getByTestId('ledger-block-head').getByRole('button', { name: PANEL, exact: true });
      await head.click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await bothTrees(page, '차단기 대장 + 상세');

      // 전원 계통 계통도 — 레일 열린 채 · 닫고
      await main(page).getByRole('radio', { name: '계통도' }).click();
      await expect(main(page).getByRole('tree', { name: '계통도' })).toBeVisible();
      await bothTrees(page, '계통도 + 상세');
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click();
      await bothTrees(page, '계통도');

      // 평면도 — 트리는 잠기지 않는다(배경 도면 도구는 판 안). 상태표시줄 칸은 한 줄
      await main(page).getByRole('tab', { name: '평면도' }).click();
      await expect(page.getByTestId('rackplan-canvas')).toBeVisible();
      await bothTrees(page, '평면도');
      // 평면도 + 상세 레일 — 랙을 고르면 선다(현황에서 고른 랙으로 연다)
      await main(page).getByRole('tab', { name: '현황' }).click();
      await main(page).getByRole('row').filter({ hasText: RACK }).first().click();
      await main(page).getByRole('tab', { name: '평면도' }).click();
      await expect(page.getByTestId('rackplan-canvas')).toBeVisible();
      if (await detail(page).count()) await bothTrees(page, '평면도 + 랙 상세');
      const tall = await main(page).locator('.status-bar > *').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 34).map((e) => e.textContent));
      expect(tall, '상태표시줄 칸이 두 줄로 서지 않는다').toEqual([]);

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('선번장 · 측정 창', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', SHEET_STATION);
      await main(page).getByRole('tab', { name: '선번장' }).click();
      const blocks = main(page).getByTestId('sheet-block');
      await expect(blocks.first()).toBeVisible();
      await bothTrees(page, '선번장');

      // 상세 레일 열림 — 자국 접속 설비 이름을 누른다
      await main(page).locator('td[data-col="near"] button[title]').first().click();
      await expect(detail(page)).toHaveCount(1);
      await bothTrees(page, '선번장 + 상세');
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click();

      // 측정 등록 창 · 코어 측정 기록 창
      await blocks.first().getByRole('button', { name: '측정 등록' }).click();
      const measure = page.getByRole('dialog', { name: /^측정 등록/ });
      await expect(measure).toBeVisible();
      await dialogOk(page, '측정 등록 창');
      await measure.getByRole('button', { name: '취소' }).click();
      await blocks.first().getByRole('button', { name: /측정 기록/ }).first().click();
      const history = page.getByRole('dialog', { name: /^코어 / });
      await expect(history).toBeVisible();
      await dialogOk(page, '코어 측정 기록 창');
      await history.getByRole('button', { name: '닫기' }).last().click();

      // 광선로 수정 창 · 중계경로 창
      await blocks.first().getByRole('button', { name: '광선로 수정' }).click();
      const lineEdit = page.getByRole('dialog', { name: '광선로 수정' });
      await expect(lineEdit).toBeVisible();
      await dialogOk(page, '광선로 수정 창');
      await lineEdit.getByRole('button', { name: '취소' }).click();
      const traceRow = blocks.first().locator('tbody tr').filter({ has: page.getByRole('button', { name: /중계경로$/ }) }).first();
      await traceRow.hover();
      await traceRow.getByRole('button', { name: /중계경로$/ }).click();
      const trace = page.getByRole('dialog');
      await expect(trace.getByTestId('path-summary')).toBeVisible();
      await dialogOk(page, '중계경로 창');
      await trace.getByRole('button', { name: '닫기' }).last().click();
      await expect(trace).toHaveCount(0);

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('광 계통도(상태표시줄 범례) · 지사 현황', async ({ page }) => {
      await login(page);
      await openBranch(page, '강원본부', '직할');
      await bothTrees(page, '지사 현황');
      await main(page).getByRole('tab', { name: '광 계통도' }).click();
      await expect(main(page).getByTestId('optical-map').locator('[data-station]').first()).toBeVisible();
      await bothTrees(page, '광 계통도');
    });

    test('설계서 · 품목 관리 · 기준정보', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', STATION);
      // 설계서를 열 거리 — 랙 하나(저장하지 않는다)
      await main(page).getByRole('button', { name: '랙 추가' }).click();
      const addRack = page.getByRole('dialog', { name: '랙 추가' });
      await addRack.getByRole('textbox', { name: '이름' }).fill('가로검사랙');
      await addRack.getByRole('combobox', { name: '랙 품목' }).selectOption({ label: '19인치 통신랙' });
      await addRack.getByRole('button', { name: '추가' }).click();
      await page.getByRole('button', { name: '설계서', exact: true }).click();
      const design = page.getByRole('dialog', { name: '설계서' });
      await expect(design.getByRole('table').first()).toBeVisible();
      await dialogOk(page, '설계서');
      await design.getByRole('button', { name: '닫기' }).last().click();
      await page.getByRole('button', { name: '변경 취소' }).click();
      await page.getByRole('alertdialog', { name: '변경 취소' }).getByRole('button', { name: '변경 취소' }).click();
      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);

      for (const kind of ['equipment', 'rack', 'cable', 'category'] as const) {
        await page.goto(`/catalog?kind=${kind}`);
        await expect(page.getByRole('table')).toBeVisible();
        expect(await layoutProblems(page), `품목 관리 ${kind}`).toEqual([]);
      }
      await page.goto('/standards');
      for (const tab of ['노임단가', '제비율', '등록 이력'] as const) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(200);
        expect(await layoutProblems(page), `기준정보 ${tab}`).toEqual([]);
      }
    });
  });
}

test('배치 검사가 눈이 멀지 않았다 — 좁은 글 열·잘린 수·두 줄 머리글·상태표시줄 겹침을 잡는다', async ({ page }) => {
  await page.setContent(`
    <div data-testid="sheet-block"><table style="table-layout:fixed;width:110px"><colgroup><col style="width:90px"><col style="width:20px"></colgroup><tr>
      <th style="height:44px">두<br>줄</th><th>수</th></tr><tr>
      <td data-col="near" style="width:90px"><span class="line-clamp-2" style="display:block;line-height:20px">가<br>나<br>다</span></td>
      <td class="text-right" data-col="loss" style="width:20px;white-space:nowrap;overflow:hidden">-12.345</td>
    </tr></table></div>
    <div class="status-bar" style="display:flex;width:200px;height:28px"><span style="margin-right:-60px">변전소 12</span><span>광선로 13</span></div>`);
  const p = await layoutProblems(page);
  expect(p, p.join(' | ')).not.toEqual([]);
  expect(p.some((x) => x.startsWith('선번장 near 폭'))).toBe(true);
  expect(p.some((x) => x.startsWith('선번장 near 세 줄'))).toBe(true);
  expect(p.some((x) => x.startsWith('잘린 수'))).toBe(true);
  expect(p.some((x) => x.startsWith('두 줄 머리글'))).toBe(true);
  expect(p.some((x) => x.startsWith('상태표시줄 겹침'))).toBe(true);
});
