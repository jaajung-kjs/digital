"""직할 국소명 정규화 — 별칭→표준 key, 13직할/외부 판정, 무순서 dedup 키."""
import re

# 13 직할 key → 표준 표시명(substations.json name 과 일치)
DIRECT = {
    "guchuncheon": "(구)춘천S/S", "sinchuncheon": "(신)춘천S/S", "bukchuncheon": "북춘천S/S",
    "namchuncheon": "남춘천S/S", "seohongcheon": "서홍천S/S", "yeolbyeonghap": "열병합S/Y",
    "inje": "인제S/S", "yanggu": "양구S/S", "cheorwon": "철원S/S", "hwacheon": "화천S/S",
    "hwacheonhp": "화천H/P", "chuncheonhp": "춘천H/P", "soyanghp": "소양강H/P",
}

# 원문 별칭(정규화 후 문자열) → key. (구)/(신)춘천 모호는 검수에서 별도 처리.
ALIAS = {
    "춘천": "guchuncheon",  # 바 '춘천'/'춘천S/S' = (구)춘천(원 춘천변전소). (신)춘천은 '신춘천'으로 구분.
    "구춘천": "guchuncheon", "신춘천": "sinchuncheon", "북춘천": "bukchuncheon", "남춘천": "namchuncheon",
    "서홍천": "seohongcheon", "열병합": "yeolbyeonghap", "춘천열병합": "yeolbyeonghap",
    "인제": "inje", "양구": "yanggu", "철원": "cheorwon", "화천": "hwacheon",
    "화천hp": "hwacheonhp", "춘천hp": "chuncheonhp", "소양hp": "soyanghp", "소양강": "soyanghp",
}


def _clean(raw):
    s = (raw or "").lower()
    s = re.sub(r"\s+", "", s)
    # (신)/(구) 춘천 먼저 보존(일반 괄호제거 전): (신)→신, (구)→제거. 그래야 (신)춘천≠구춘천.
    s = s.replace("(신)", "신").replace("(구)", "")
    s = s.replace("s/s", "").replace("s/y", "").replace("h/p", "hp").replace("s/t", "")
    s = re.sub(r"#\d+", "", s)
    s = re.sub(r"\(.*?\)", "", s)  # (좌측N열)·(12C) 등
    s = s.replace("비금속", "").replace("경로a", "").replace("경로b", "")
    return s


def normalize_station(raw):
    """원문 국소명 → key. 13직할은 표준 key, 그 외는 'ext:'+정규화문자열."""
    if not raw:
        return None
    c = _clean(raw)
    if not c:
        return None
    if c in ALIAS:
        return ALIAS[c]
    if c in DIRECT:
        return c
    return "ext:" + c


def is_direct(key):
    return key in DIRECT


def pair_key(a, b):
    """변전소 쌍 무순서 dedup 키."""
    return tuple(sorted([a, b]))
