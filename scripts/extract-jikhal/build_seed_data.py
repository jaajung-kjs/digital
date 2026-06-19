"""병합 → 최종 시드 JSON 3종 (backend/prisma/seed/data/jikhal/).

규칙(사용자 확정):
  - 실제 DB에 있는 변전소(직할 13)끼리만 연결. 외부/비변전소(강원D/D·사택계·홍천 등) 슬롯·코어 제외.
  - 슬롯 = 한 변전소 입장의 케이블 1가닥(상대국+코어수). 직할쌍은 양측 슬롯을 OPGW 로 연결.
  - 송광치 코어만 송변전광단말장치(OPT-TERM)에 연결, 나머지는 OFD 에(메타전용).
  - 임시 배치: 컨테이너(OFD·RACK)는 60×60 으로 도면에 배치, 그 자식(슬롯·장치)은 slotIndex.
    OFD(60×60) 안에 경로슬롯, RACK(60×60) 안에 송변전광단말장치.
"""
import json
import os
import re
import collections
from normalize import DIRECT, is_direct, pair_key

OUT = os.path.join(os.path.dirname(__file__), "out")
DST = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "prisma", "seed", "data", "jikhal")
BOX = 60  # 임시 배치 컨테이너 크기


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def cable_idx(peer_raw):
    m = re.search(r"#(\d+)", peer_raw or "")
    return int(m.group(1)) if m else 0


def slot_key(sub, block):
    return f"slot-{sub}-b{block}"


def complete_reciprocals(blocks):
    """모든 직할쌍 블록이 양방향 짝을 갖도록 보완(케이블=OPGW 가 코어수 단일 SSOT 라
    슬롯은 반드시 OPGW 1:1). 한쪽만 기재된 케이블은 반대편 종단 슬롯을 추론 생성한다."""
    by_dir = collections.defaultdict(list)
    for b in blocks:
        by_dir[(b["subKey"], b["peerKey"])].append(b)
    synth, sid, seen = [], 9000, set()
    for (a, bsub) in list(by_dir.keys()):
        pk = pair_key(a, bsub)
        if pk in seen:
            continue
        seen.add(pk)
        ab = sorted(by_dir.get((a, bsub), []), key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        bb = sorted(by_dir.get((bsub, a), []), key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        short, long_, extras = (a, bsub, bb[len(ab):]) if len(bb) > len(ab) else (bsub, a, ab[len(bb):])
        for x in extras:
            sid += 1
            synth.append({"subKey": short, "peerKey": long_, "peerRaw": DIRECT[long_],
                          "block": sid, "cores": x["cores"]})
    return blocks + synth


def main():
    os.makedirs(DST, exist_ok=True)
    cores = json.load(open(os.path.join(OUT, "ofd_cores.json")))
    blocks = json.load(open(os.path.join(OUT, "ofd_blocks.json")))

    # ── 직할 13 끼리만 + 양방향 보완(모든 슬롯이 OPGW 1:1) ──
    blocks = [b for b in blocks if is_direct(b["peerKey"])]
    blocks = complete_reciprocals(blocks)
    keep = {(b["subKey"], b["block"]) for b in blocks}
    cores = [c for c in cores if (c["subKey"], c["block"]) in keep]

    subs = [{"key": k, "name": v, "isExternal": False} for k, v in DIRECT.items()]

    # ── assets: OFD(60×60) + RACK(60×60) + 슬롯(slotIndex) + 송변전광단말(slotIndex) ──
    assets = []
    for k in DIRECT:
        assets.append({"key": f"ofd-{k}", "subKey": k, "typeCode": "OFD", "name": "OFD",
                       "parentKey": None, "posX": 200, "posY": 200, "w": BOX, "h": BOX})
        assets.append({"key": f"rack-{k}", "subKey": k, "typeCode": "RACK", "name": "통신랙",
                       "parentKey": None, "posX": 320, "posY": 200, "w": BOX, "h": BOX})
    # 슬롯 이름 = "자국 - 대국 -N #코어수". 같은 경로(자국→대국) 여러 케이블이면 N=1,2…(등장 순).
    slot_i = collections.defaultdict(int)   # slotIndex (OFD 내 위치)
    route_i = collections.defaultdict(int)  # -N (자국→대국 경로 순번)
    blocks_sorted = sorted(blocks, key=lambda b: (b["subKey"], b["peerKey"], cable_idx(b["peerRaw"]), b["block"]))
    for b in blocks_sorted:
        sub, peer = b["subKey"], b["peerKey"]
        route_i[(sub, peer)] += 1
        ri = route_i[(sub, peer)]
        si = slot_i[sub]; slot_i[sub] += 1
        name = f"{DIRECT[sub]} - {DIRECT[peer]} -{ri} #{b['cores']}"
        # 코어수는 OPGW(케이블)가 단독 소유 — 슬롯엔 중복 저장하지 않음(SSOT).
        assets.append({"key": slot_key(sub, b["block"]), "subKey": sub, "typeCode": "OFD-SLOT",
                       "name": name, "parentKey": f"ofd-{sub}", "slotIndex": si})
    # 송변전광단말장치 — 송광치 코어 있는 국소에만, 랙 안 slotIndex 0
    dev_subs = sorted({c["subKey"] for c in cores if c["purpose"] == "송광치"})
    dev_by_sub = {}
    for sub in dev_subs:
        key = f"dev-OPT-TERM-{sub}"
        assets.append({"key": key, "subKey": sub, "typeCode": "OPT-TERM", "name": "송변전광단말장치",
                       "parentKey": f"rack-{sub}", "slotIndex": 0})
        dev_by_sub[sub] = key

    # ── fiberCables: OUT 코어 — 송광치만(나머지 메타전용 코어는 시드 안 함) ──
    cables = []
    for c in cores:
        if c["purpose"] != "송광치" or c["subKey"] not in dev_by_sub:
            continue
        sub, blk = c["subKey"], c["block"]
        sp = {kk: c[kk] for kk in ("purpose", "circuitText", "spliceType", "usageOverride",
                                   "loss1310", "loss1550", "dist1310", "dist1550", "inspectResult")
              if c.get(kk) is not None}
        sp["peer"] = clean(c["peerRaw"])
        cables.append({"key": f"core-{sub}-b{blk}-{c['core']}", "kind": "CORE",
                       "sourceKey": slot_key(sub, blk), "targetKey": dev_by_sub[sub], "sourceRole": "OUT", "targetRole": None,
                       "number": c["core"], "categoryCode": "CBL-OPJ", "specParams": sp})

    # ── fiberCables: OPGW (직할쌍 슬롯↔슬롯) ──
    by_dir = collections.defaultdict(list)
    for b in blocks:
        by_dir[(b["subKey"], b["peerKey"])].append(b)
    seen, opgw_n, unmatched = set(), 0, 0
    for (a, bsub), ablocks in by_dir.items():
        pk = pair_key(a, bsub)
        if pk in seen:
            continue
        seen.add(pk)
        bblocks = by_dir.get((bsub, a), [])
        asort = sorted(ablocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        bsort = sorted(bblocks, key=lambda x: (cable_idx(x["peerRaw"]), x["block"]))
        for ab, bb in zip(asort, bsort):
            opgw_n += 1
            cables.append({"key": f"opgw-{a}-{bsub}-{opgw_n}", "kind": "OPGW",
                           "sourceKey": slot_key(a, ab["block"]), "targetKey": slot_key(bsub, bb["block"]),
                           "sourceRole": "IN", "targetRole": "IN", "number": None,
                           "categoryCode": "CBL-OPT", "specParams": {"cores": ab["cores"]}})
        unmatched += abs(len(asort) - len(bsort))

    json.dump(subs, open(os.path.join(DST, "substations.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(assets, open(os.path.join(DST, "assets.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(cables, open(os.path.join(DST, "fiberCables.json"), "w"), ensure_ascii=False, indent=1)
    nslot = sum(1 for a in assets if a["typeCode"] == "OFD-SLOT")
    print(f"subs {len(subs)}  assets {len(assets)} (OFD {len(DIRECT)} + RACK {len(DIRECT)} + slot {nslot} + dev {len(dev_by_sub)})")
    print(f"cables {len(cables)} (CORE {sum(1 for x in cables if x['kind']=='CORE')} + OPGW {opgw_n})  양측불일치 {unmatched}")


if __name__ == "__main__":
    main()
