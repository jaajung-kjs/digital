import { expect, test, type Page } from '@playwright/test';
import { login, openStation } from './helpers';

/**
 * 화면 스크린샷 — ②-b 정리 뒤 모든 화면을 두 폭(1280×800 · 1440×900)으로 찍어 `test-results/screens/` 에 남긴다.
 * 판정은 사람이(또는 검토자가) 그림을 열어 본다: 글자 세로 쪼개짐·도구줄 두 줄·겹침·잘림·금지어·빈 열.
 *
 * 읽기만 한다 — 아무것도 저장하지 않는다(열었던 대화상자는 닫는다). 기계로 잡을 수 있는 것
 * (도구줄 한 줄, 화면 글자 금지어)은 여기서도 함께 본다.
 */

const STATION = '(구)춘천S/S';
const PANEL = '통신용 분전반'; // 차단기 22 · 연결 여럿
const RACK = 'ICT관제소 서버랙'; // 설비 여럿이 든 랙
const OUT = 'test-results/screens';
const SHEET_STATION = '북춘천S/S';

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** 화면 글자 금지어(CONVENTIONS §0) — 「판」·「키」는 홀로 쓴 낱말로만 본다(평면도·노임단가 같은 말은 된다). */
const FORBIDDEN = [/회로/, /안의 설비/, /종류/, /자산/, /(^|[\s·(])판($|[\s·)])/, /(^|\s)키($|\s)/,
  // 구어체 동작어(용어집 docs/superpowers/plans/2026-10-07-화면-용어-정비.md) — uiWords.guardrail 과 같은 목록을 그려진 글자에도 건다.
  /(?<![가-힣])잇기/, /이쪽/, /반대쪽/, /지우(?:기|면|세요|지)|지울|지웁|지워/, /고치|고친|고칠/, /넣(?:기|으|습|는|을|은|어|지)/,
  /고르(?:세요|기|면)|골라|(?<![가-힣])고른/, /(?<![가-힣])올(?:린|리세요|리면|리기|려)/, /놓(?:인|을|으세요|기|였)/, /빼기/, /(?<![가-힣])잰(?![가-힣])/,
  // 현장 문서 어휘(2차 정비) — 본 설비 · 단자 · 상대 단자 · 자국 측 · 대국 측.
  /(?<![가-힣])본 설비/, /상대 단자/, /단자/, /(?<![가-힣])자국 ?측(?![정면])/, /(?<![가-힣])대국 ?측(?![정면])/];

const main = (page: Page) => page.getByTestId('v2-main');
/** 찍기 전 — 손을 치우고 호버·선택색 전환(150ms)이 끝나기를 기다린다. */
const settle = async (page: Page) => { await page.mouse.move(0, 0); await page.waitForTimeout(300); };
const detail = (page: Page) => main(page).getByRole('complementary');

async function noForbiddenWords(page: Page, where: string) {
  const text = await page.locator('body').innerText();
  for (const re of FORBIDDEN) expect(text, `${where}: 금지어 ${re}`).not.toMatch(re);
}

/** 현황 도구줄(머리 띠)이 한 줄인가 — 줄이 넘치면 높이가 한 줄 높이를 넘는다. */
async function toolbarIsOneLine(page: Page) {
  const bar = main(page).getByRole('radiogroup', { name: '현황 보기' }).locator('xpath=../..');
  await page.evaluate(() => document.fonts.ready);
  // 글꼴·배치가 자리를 잡을 때까지 다시 잰다 — 한 번 재고 끝내면 막 그려지던 높이를 읽는다.
  await expect.poll(async () => (await bar.boundingBox())?.height ?? Infinity, { message: '현황 도구줄 높이' }).toBeLessThanOrEqual(44);
}

for (const vp of VIEWPORTS) {
  test.describe(`화면 ${vp.width}`, () => {
    test.use({ viewport: vp });
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${vp.width}-${name}.png` });

    test('현황 · 상세 · 평면도', async ({ page }) => {
      await login(page);
      // 국 id 는 재시드마다 바뀐다 — 주소를 외우지 않고 트리로 연다(강원본부 › 직할).
      await openStation(page, '강원본부', '직할', STATION);

      // 현황 — 품목별
      await expect(main(page).getByRole('radio', { name: '품목별' })).toBeChecked();
      await expect(main(page).getByRole('row').nth(2)).toBeVisible();
      await toolbarIsOneLine(page);
      await noForbiddenWords(page, '현황 품목별');
      await shot(page, '01-status-by-type');

      // 현황 — 랙별
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await expect(main(page).getByRole('radio', { name: '랙별' })).toBeChecked();
      await toolbarIsOneLine(page);
      await noForbiddenWords(page, '현황 랙별');
      await page.mouse.move(0, 0); // 갈래 단추의 호버·색 전환이 끝난 뒤에 찍는다
      await page.waitForTimeout(300);
      await shot(page, '02-status-by-rack');

      // 설비 상세 — 정보(차단기 요약 카드)
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await noForbiddenWords(page, '설비 상세 정보');
      await shot(page, '03-equipment-info');

      // 설비 상세 — 연결(두 줄)
      await detail(page).getByRole('tab', { name: '연결' }).click();
      await expect(detail(page).getByTestId('link-far').first()).toBeVisible();
      await noForbiddenWords(page, '설비 상세 연결');
      await shot(page, '04-equipment-links');

      // 차단기 편집 창
      await detail(page).getByRole('tab', { name: '정보' }).click();
      await detail(page).getByRole('button', { name: '편집', exact: true }).click();
      const editor = page.getByRole('dialog', { name: `차단기 — ${PANEL}` });
      await expect(editor).toBeVisible();
      await expect(editor.getByTestId('circuit-no').first()).toBeVisible();
      await noForbiddenWords(page, '차단기 편집 창');
      await shot(page, '05-breaker-editor');
      await editor.getByRole('button', { name: '완료' }).click();
      await expect(editor).toHaveCount(0);

      // 설비 머리 — 항목 하나짜리 ⋯ 메뉴는 없다(차단기가 있으면 카드의 「추가」가 그 길)
      await expect(detail(page).getByRole('button', { name: '더 보기' })).toHaveCount(0);

      // 랙 상세 — 실장 설비
      await main(page).getByRole('row').filter({ hasText: RACK }).first().click();
      await expect(detail(page).getByText(/^실장 설비 \d+/)).toBeVisible();
      await noForbiddenWords(page, '랙 상세');
      await shot(page, '07-rack-detail');

      // 설비 추가
      await main(page).getByRole('button', { name: '설비 추가' }).first().click();
      const add = page.getByRole('dialog', { name: '설비 추가' });
      await expect(add).toBeVisible();
      await noForbiddenWords(page, '설비 추가');
      await shot(page, '08-add-equipment');
      await add.getByRole('button', { name: '취소' }).click();
      await expect(add).toHaveCount(0);

      // 랙 추가
      await main(page).getByRole('button', { name: '랙 추가' }).click();
      const addRack = page.getByRole('dialog', { name: '랙 추가' });
      await expect(addRack).toBeVisible();
      await shot(page, '09-add-rack');
      await addRack.getByRole('button', { name: '취소' }).click();
      await expect(addRack).toHaveCount(0);

      // 평면도
      await main(page).getByRole('tab', { name: '평면도' }).click();
      await expect(page.getByTestId('rackplan-canvas')).toBeVisible();
      await page.waitForTimeout(500); // 캔버스가 맞춰 그려질 때까지
      await noForbiddenWords(page, '평면도');
      await shot(page, '10-floor-plan');

      // 변경안이 없어야 한다 — 읽기만 했다
      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('선번장 · 상세 패널 광선로 슬롯', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', SHEET_STATION);
      await main(page).getByRole('tab', { name: '선번장' }).click();
      const blocks = main(page).getByTestId('sheet-block');
      await expect(blocks.first()).toBeVisible();

      // 선번장 — 조직 트리 펼침
      await expect(blocks).toHaveCount(3);
      await noForbiddenWords(page, '선번장');
      await shot(page, '20-sheet-tree-open');

      // 선번장 — 조직 트리 접음(넓은 표를 읽는 자리). 12열이 판 안에 든다 — 가로 그늘 없음
      await page.getByRole('button', { name: '조직 접기' }).click();
      await expect(page.getByRole('button', { name: '조직 펼치기' })).toBeVisible();
      await expect(page.getByTestId('overflow-shade')).toHaveCount(0);
      await page.mouse.move(0, 0);
      await shot(page, '21-sheet-tree-collapsed');

      // 상세 패널 — 현황에서 OFD 를 열면 「광선로 슬롯」 카드
      await page.getByRole('button', { name: '조직 펼치기' }).click();
      await main(page).getByRole('tab', { name: '현황' }).click();
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await main(page).getByRole('row').filter({ hasText: /^OFD/ }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('OFD');
      const slots = detail(page).getByText('광선로 슬롯').locator('xpath=../..');
      await expect(slots.getByRole('button', { name: /^슬롯 \d+ · / })).toHaveCount(3);
      await page.mouse.move(0, 0);
      await noForbiddenWords(page, '상세 광선로 슬롯');
      await shot(page, '22-panels-card');

      // 슬롯 수 고치는 중 — 상자가 카드 머리에 선다. Esc 로 물린다(아무것도 바꾸지 않는다)
      await slots.getByRole('button', { name: '슬롯 수 수정' }).click();
      await expect(slots.getByLabel('슬롯 수', { exact: true })).toBeFocused();
      await shot(page, '23-panel-count-edit');
      await page.keyboard.press('Escape');

      // 슬롯 줄 → 선번장의 그 블록(상세는 닫혀 표 전체가 선다)
      await slots.getByRole('button', { name: /^슬롯 3 · / }).click();
      await expect(blocks.and(page.locator('[aria-current="true"]'))).toBeInViewport();
      await expect(detail(page)).toHaveCount(0);
      await expect(page.getByTestId('overflow-shade')).toHaveCount(0);
      await page.mouse.move(0, 0);
      await noForbiddenWords(page, '선번장 + 상세');
      await shot(page, '24-sheet-from-slot');

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('전원 계통 · 상세에서 전원 계통으로', async ({ page }) => {
      await login(page);
      await openStation(page, '강원본부', '직할', STATION);
      await main(page).getByRole('tab', { name: '전원 계통' }).click();
      const blocks = main(page).getByTestId('ledger-block');
      await expect(blocks.first()).toBeVisible();

      // 차단기 대장 — 고른 것이 없으면 상세 레일이 없다(표가 우선)
      await expect(main(page).getByRole('radio', { name: '차단기 대장' })).toBeChecked();
      await expect(detail(page)).toHaveCount(0);
      await settle(page);
      await noForbiddenWords(page, '차단기 대장');
      await shot(page, '30-power-ledger');

      // 블록 머리의 설비 이름 → 그 설비 상세 + 블록 초점(판은 가로로 구르고 그늘이 선다)
      const panel = blocks.filter({ has: page.getByTestId('ledger-block-head').getByRole('button', { name: PANEL, exact: true }) });
      await panel.getByTestId('ledger-block-head').getByRole('button', { name: PANEL, exact: true }).click();
      await expect(panel).toHaveAttribute('aria-current', 'true');
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await settle(page);
      await noForbiddenWords(page, '차단기 대장 + 상세');
      await shot(page, '31-power-ledger-detail');

      // 계통도 — 상세가 선 채로
      await main(page).getByRole('radio', { name: '계통도' }).click();
      const tree = main(page).getByRole('tree', { name: '계통도' });
      await expect(tree.getByTestId('tree-equipment').first()).toBeVisible();
      await settle(page);
      await noForbiddenWords(page, '계통도 + 상세');
      await shot(page, '32-power-tree-detail');

      // 계통도 — 상세를 닫고 판 전체, 직류만
      await detail(page).getByRole('button', { name: '닫기', exact: true }).click();
      await expect(detail(page)).toHaveCount(0);
      await expect(tree.locator('[aria-selected="true"]')).toHaveCount(0);
      await settle(page);
      await shot(page, '33-power-tree');
      await main(page).getByRole('combobox', { name: '교류/직류' }).selectOption({ label: '직류' });
      await expect(tree.getByTestId('tree-breaker').filter({ hasText: '· 교류' })).toHaveCount(0);
      await settle(page);
      await noForbiddenWords(page, '계통도 직류');
      await shot(page, '34-power-tree-dc');
      await main(page).getByRole('combobox', { name: '교류/직류' }).selectOption({ label: '전체' });

      // 상세에서 전원 계통으로 — 현황에서 분전반을 열고 차단기 카드 머리의 「차단기 대장에서 보기」
      await main(page).getByRole('tab', { name: '현황' }).click();
      await main(page).getByRole('radio', { name: '랙별' }).click();
      await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
      await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
      await detail(page).getByRole('button', { name: '차단기 대장에서 보기' }).click();
      await expect(main(page).getByRole('radio', { name: '차단기 대장' })).toBeChecked();
      await expect(blocks.and(page.locator('[aria-current="true"]')).getByTestId('ledger-block-head')).toBeInViewport();
      await settle(page);
      await noForbiddenWords(page, '상세 → 차단기 대장');
      await shot(page, '35-power-from-detail');

      await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    });

    test('품목 관리 · 기준정보', async ({ page }) => {
      await login(page);
      for (const [kind, label] of [['equipment', '설비 품목'], ['rack', '랙 품목'], ['cable', '케이블 품목'], ['category', '분야']] as const) {
        await page.goto(`/catalog?kind=${kind}`);
        await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-current', 'true');
        await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
        await noForbiddenWords(page, `품목 관리 ${label}`);
        await shot(page, `11-catalog-${kind}`);
      }

      await page.goto('/standards');
      for (const [i, tab] of (['노임단가', '제비율', '등록 이력'] as const).entries()) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
        await page.waitForTimeout(300);
        await noForbiddenWords(page, `기준정보 ${tab}`);
        await shot(page, `12-standards-${i + 1}`);
      }
    });
  });
}
