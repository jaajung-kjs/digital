import unittest
from normalize import normalize_station, is_direct, pair_key


class T(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(normalize_station("춘천H/P"), "chuncheonhp")
        self.assertEqual(normalize_station("춘천열병합"), "yeolbyeonghap")
        self.assertEqual(normalize_station("열병합S/Y"), "yeolbyeonghap")
        self.assertEqual(normalize_station("북춘천S/S\n#1"), "bukchuncheon")

    def test_external(self):
        self.assertFalse(is_direct(normalize_station("홍천S/S")))
        self.assertTrue(is_direct("guchuncheon"))
        self.assertEqual(normalize_station("홍천S/S"), "ext:홍천")

    def test_pair_unordered(self):
        self.assertEqual(pair_key("a", "b"), pair_key("b", "a"))


if __name__ == "__main__":
    unittest.main()
