# 테스트 픽스처

| 파일 | 출처 | SHA-256 |
|---|---|---|
| `plan-sample.dwg` | 저장소 내 `plan/A08평면도B1.dwg` (AC1018 / AutoCAD 2004) | — |
| `test_dgnv8.dgn` | OSGeo/GDAL `autotest/ogr/data/dgnv8/test_dgnv8.dgn`, 커밋 `18e7cceb43a0dd58be474c9fdd5384baa3cde7c9` | `8f32f87ce4b16881aa64f5cb9f75c98851833f96fef37ca0ad31aa6bb18d1df0` |
| `wage-2026H1.hwp` | 대한건설협회 「2026년 상반기 적용 건설업 임금실태조사 보고서」 공개 배포본 | `866c8063ca0f6095e859eebd59f9979c0a6723864970a7066ae28c4bd62129fe` |
| `overhead-2026.xlsx` | 조달청 「토목공사 간접공사비 적용기준」(2026.4.30 적용) 공개 배포본 | `3e498b0056d643bf16f4dad760ff62539a2568bfdfcd1deb711d687b6be3d276` |

노임 보고서·제비율표는 **실물 그대로** 둔다 — HWP 표는 분기마다 직종 수·페이지 분할이 달라지므로,
축약본으로는 파서가 진짜 양식을 견디는지 증명할 수 없다(132직종 · 4개 기준일 · 각주 표시).

GDAL 배포본의 일반 라이선스는 MIT 계열이다. 원본 바이트를 변경 없이 배치했다.
