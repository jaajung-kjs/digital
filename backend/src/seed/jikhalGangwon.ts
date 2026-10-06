/**
 * 강원본부 직할 국·판·OPGW — **순수 데이터**다. 시드(`jikhal.ts`)가 읽어 국·OFD·광선로·측정으로 세운다.
 *
 * 자료는 `직할/직할_OFD선번장_260203.xlsx` 에서 뽑았다(국별 시트의 「상대국명」 블록).
 * 지어낸 것이 하나도 없다: 국 이름은 시트 이름, 판(슬롯) 번호와 심수는 블록 그대로,
 * OPGW 는 양쪽 국의 판이 서로를 가리킬 때만 잇는다.
 *
 * **슬롯 하나 = 판 한 장**이다. 선로가 아니다: 48심 한 가닥은 판 두 장에 나눠 성단되고
 * 선번장도 그렇게 적힌다((구)춘천의 「강원D/D #1」이 두 번 나오는 것이 그것 — 코어가
 * 1~24, 25~48 로 이어진다). 그래서 같은 대국이 두 슬롯에 걸릴 수 있다.
 *
 * **실제로 이은 판만 세우고 번호를 당긴다**(`seatedPlates`). 직할 밖으로 나가는 판은 상대가
 * 없어 잇지 못하므로 자리를 세우지 않고, 이은 판만 원래 차례대로 1번부터 다시 센다.
 */

/**
 * 강원본부 직할 13국 — 시트 이름에 **국 종별 꼬리**를 붙였다(S/S 변전소, H/P 수력,
 * S/Y 열병합). 선번장이 대국을 부르는 표기가 그것이라, 같은 이름으로 세워야 자료와
 * 화면이 같은 말을 한다.
 */
export const STATIONS = [
  { key: 'guchuncheon', name: '(구)춘천S/S' },
  { key: 'sinchuncheon', name: '(신)춘천S/S' },
  { key: 'bukchuncheon', name: '북춘천S/S' },
  { key: 'namchuncheon', name: '남춘천S/S' },
  { key: 'seohongcheon', name: '서홍천S/S' },
  { key: 'yeolbyeonghap', name: '열병합S/Y' },
  { key: 'inje', name: '인제S/S' },
  { key: 'yanggu', name: '양구S/S' },
  { key: 'cheorwon', name: '철원S/S' },
  { key: 'hwacheon', name: '화천S/S' },
  { key: 'hwacheonhp', name: '화천H/P' },
  { key: 'chuncheonhp', name: '춘천H/P' },
] as const;

export type StationKey = (typeof STATIONS)[number]['key'];

/** 국마다 OFD 에 꽂힌 판 — 선번장의 블록 그대로(슬롯 = 판 한 장, 성단 심수와 상대국). */
export const PLATES: Record<StationKey, { slot: number; cores: number; peer: string }[]> = {
  guchuncheon: [
    { slot: 1, cores: 24, peer: '홍천S/S' }, { slot: 2, cores: 24, peer: '북춘천S/S' },
    { slot: 3, cores: 12, peer: '사택계 (12C)' }, { slot: 4, cores: 12, peer: '강원D/D #3' },
    { slot: 5, cores: 24, peer: '강원D/D #2' }, { slot: 6, cores: 24, peer: '강원D/D #1' },
    { slot: 7, cores: 24, peer: '강원D/D #1' }, { slot: 8, cores: 12, peer: '차세대 SCADA실 (12C)' },
    { slot: 9, cores: 24, peer: '강원D/D #4' }, { slot: 10, cores: 24, peer: '신춘천 #1' },
    { slot: 11, cores: 24, peer: '신춘천 #2' },
  ],
  sinchuncheon: [{ slot: 1, cores: 24, peer: '구춘천 #1' }, { slot: 2, cores: 24, peer: '구춘천 #2' }],
  bukchuncheon: [
    { slot: 1, cores: 24, peer: '춘천S/S' }, { slot: 2, cores: 24, peer: '춘천H/P #1' },
    { slot: 3, cores: 24, peer: '춘천H/P #2' },
  ],
  namchuncheon: [
    { slot: 1, cores: 24, peer: '홍천' }, { slot: 2, cores: 24, peer: '열병합S/Y' },
    { slot: 3, cores: 24, peer: '강원D/D 비금속' }, { slot: 4, cores: 24, peer: '열병합S/Y 비금속' },
  ],
  seohongcheon: [{ slot: 1, cores: 12, peer: '열병합S/Y' }, { slot: 2, cores: 12, peer: '청평P/P' }],
  yeolbyeonghap: [
    { slot: 1, cores: 24, peer: '남춘천S/S' }, { slot: 2, cores: 12, peer: '청평P/P' },
    { slot: 3, cores: 12, peer: '서홍천S/S' }, { slot: 4, cores: 24, peer: '남춘천S/S 비금속' },
    { slot: 5, cores: 24, peer: '홍천B/O 비금속' },
  ],
  inje: [
    { slot: 1, cores: 24, peer: '간성S/S' }, { slot: 2, cores: 24, peer: '간성S/S' },
    { slot: 3, cores: 24, peer: '상남S/S' }, { slot: 4, cores: 24, peer: '양구S/S' },
    { slot: 5, cores: 24, peer: '신양양S/S' }, { slot: 6, cores: 24, peer: '인제B/O #경로A' },
    { slot: 7, cores: 24, peer: '인제B/O #경로B' },
  ],
  yanggu: [
    { slot: 1, cores: 24, peer: '인제S/S' }, { slot: 2, cores: 24, peer: '상남S/S' },
    { slot: 3, cores: 24, peer: '화천H/P' }, { slot: 4, cores: 24, peer: '양구B/O #경로A' },
    { slot: 5, cores: 24, peer: '양구B/O #경로B' },
  ],
  cheorwon: [
    { slot: 1, cores: 24, peer: '화천S/S' }, { slot: 2, cores: 24, peer: '운천S/S' },
    { slot: 3, cores: 24, peer: '철원B/O #경로A' }, { slot: 4, cores: 24, peer: '철원B/O #경로B' },
  ],
  hwacheon: [
    { slot: 1, cores: 24, peer: '화천H/P' }, { slot: 2, cores: 24, peer: '철원S/S' },
    { slot: 3, cores: 24, peer: '화천B/O #경로A' }, { slot: 4, cores: 24, peer: '화천B/O #경로B' },
  ],
  hwacheonhp: [
    { slot: 1, cores: 24, peer: '춘천H/P' }, { slot: 2, cores: 24, peer: '화천S/S' },
    { slot: 3, cores: 24, peer: '양구S/S' },
  ],
  chuncheonhp: [
    { slot: 1, cores: 24, peer: '가평S/S (좌측 2열)' }, { slot: 2, cores: 24, peer: '화천H/P' },
    { slot: 3, cores: 24, peer: '북춘천S/S (좌측 2열)' }, { slot: 4, cores: 24, peer: '북춘천S/S (좌측 4열)' },
    { slot: 5, cores: 8, peer: 'MCR실 (좌측 2열)' }, { slot: 6, cores: 12, peer: 'MCR실 (좌측 4열)' },
  ],
};

/** 국 안끼리 잇는 OPGW — 판 대 판. 양쪽 판이 서로를 가리키는 것만 여기 있다. */
export const OPGW: { a: StationKey; aSlot: number; b: StationKey; bSlot: number }[] = [
  { a: 'guchuncheon', aSlot: 2, b: 'bukchuncheon', bSlot: 1 },
  { a: 'guchuncheon', aSlot: 10, b: 'sinchuncheon', bSlot: 1 },
  { a: 'guchuncheon', aSlot: 11, b: 'sinchuncheon', bSlot: 2 },
  { a: 'bukchuncheon', aSlot: 2, b: 'chuncheonhp', bSlot: 3 },
  { a: 'bukchuncheon', aSlot: 3, b: 'chuncheonhp', bSlot: 4 },
  { a: 'cheorwon', aSlot: 1, b: 'hwacheon', bSlot: 2 },
  { a: 'hwacheon', aSlot: 1, b: 'hwacheonhp', bSlot: 2 },
  { a: 'hwacheonhp', aSlot: 1, b: 'chuncheonhp', bSlot: 2 },
  { a: 'inje', aSlot: 4, b: 'yanggu', bSlot: 1 },
  { a: 'namchuncheon', aSlot: 2, b: 'yeolbyeonghap', bSlot: 1 },
  { a: 'namchuncheon', aSlot: 4, b: 'yeolbyeonghap', bSlot: 4 },
  { a: 'seohongcheon', aSlot: 1, b: 'yeolbyeonghap', bSlot: 3 },
  { a: 'yanggu', aSlot: 3, b: 'hwacheonhp', bSlot: 3 },
];


/**
 * 국에 **실제로 세우는 판** — OPGW 가 가리키는 판만, 선번장 차례대로.
 *
 * 원래 차례를 지키며 번호만 당긴다 — 선번장의 3번 판이 OFD 에서는 2번 자리다. 그래서
 * 이 목록의 `i` 번째가 OFD 설비 품목의 `i` 번째 구성 항목이다(시드와 backfill 이 같은 규칙을 쓴다).
 */
export function seatedPlates(key: StationKey): { slot: number; cores: number; peer: string }[] {
  const used = new Set(OPGW.flatMap((s) => [
    ...(s.a === key ? [s.aSlot] : []),
    ...(s.b === key ? [s.bSlot] : []),
  ]));
  return PLATES[key].filter((p) => used.has(p.slot));
}
