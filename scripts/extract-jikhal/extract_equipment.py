"""설비 추출 — 송광치 코어만 실제 장비(송변전광단말장치)로 연결, 나머지는 메타전용.

사용자 확정(2026-06-19): 송광치 → 송변전광단말장치(OPT-TERM) 만 실제 자산으로 생성·연결.
그 외 모든 유형(소형광·SCADA·차세대KepCIT/KepCIT·DAS·전력구감시·기타·임대·무유형)은
설비 없이 코어 메타(용도·수용내역)만 → build 에서 OUT 케이블을 OFD 자체에 연결.

산출: out/equipment.json = [{key, subKey, typeCode, name}] (송광치 있는 국소당 OPT-TERM 1대).
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "out")

# 유형 → (typeCode, 표시명). 여기 없는 유형은 메타전용(설비 미생성).
PURPOSE_MAP = {
    "송광치": ("OPT-TERM", "송변전광단말장치"),
}


def device_for(purpose):
    return PURPOSE_MAP.get(purpose)


def main():
    cores = json.load(open(os.path.join(OUT, "ofd_cores.json")))
    seen = {}
    for c in cores:
        m = device_for(c.get("purpose"))
        if not m:
            continue
        typeCode, name = m
        k = (c["subKey"], typeCode)
        if k not in seen:
            seen[k] = {"key": f"dev-{typeCode}-{c['subKey']}", "subKey": c["subKey"],
                       "typeCode": typeCode, "name": name}
    devices = list(seen.values())
    json.dump(devices, open(os.path.join(OUT, "equipment.json"), "w"), ensure_ascii=False, indent=1)
    print(f"devices {len(devices)} (송광치→OPT-TERM, 국소당 1대)")
    print("국소:", sorted(d["subKey"] for d in devices))


if __name__ == "__main__":
    main()
