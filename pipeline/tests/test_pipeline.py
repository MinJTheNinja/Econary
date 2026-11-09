"""파이프라인 순수 로직 테스트 (네트워크·Groq·Supabase 없이). 실행: py -m unittest discover -s pipeline/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import content_generator as cg  # noqa: E402
import ytn  # noqa: E402
from textnorm import match_keys, normalize_term  # noqa: E402
from word_linker import Word, WordIndex, link_keywords  # noqa: E402


class TextNormTest(unittest.TestCase):
    def test_normalize_matches_sql_rule(self):
        self.assertEqual(normalize_term(" P/E-R (x) "), "perx")
        self.assertEqual(normalize_term("가격 차별"), normalize_term("가격차별"))

    def test_match_keys_cover_parens_and_slash(self):
        keys = match_keys("ETF(상장지수펀드)")
        self.assertIn("etf", keys)
        self.assertIn("상장지수펀드", keys)
        self.assertIn("네트워크효과", match_keys("네트워크 외부성 / 네트워크 효과"))

    def test_single_char_keys_dropped(self):
        self.assertEqual(match_keys("준"), [])


class LinkerTest(unittest.TestCase):
    def setUp(self):
        self.index = WordIndex([
            Word(1, "반대매매", "미수금 미상환 시 강제 매도", None),
            Word(2, "ETF(상장지수펀드)", "거래소 상장 인덱스펀드", "Exchange Traded Fund"),
            Word(3, "비활성어", "x", None, is_active=False),
            Word(4, "듀레이션", "금리 민감도", "Duration"),
        ])

    def test_links_by_korean_english_and_paren(self):
        r = link_keywords(self.index, [
            {"term": "반대 매매", "korean_name": "반대매매"},
            {"term": "ETF", "korean_name": "상장지수펀드"},
            {"term": "Duration", "korean_name": "", "english_name": "Duration"},
        ])
        self.assertEqual([w.id for w, _ in r.linked], [1, 2, 4])
        self.assertEqual(r.unmatched, [])

    def test_inactive_and_unknown_go_unmatched(self):
        r = link_keywords(self.index, [{"term": "비활성어"}, {"term": "금리"}])
        self.assertEqual(r.linked, [])
        self.assertEqual(len(r.unmatched), 2)

    def test_same_word_linked_once_keeping_first(self):
        r = link_keywords(self.index, [{"term": "반대매매", "total_score": 90}, {"term": "반대 매매", "total_score": 60}])
        self.assertEqual(len(r.linked), 1)
        self.assertEqual(r.linked[0][1]["total_score"], 90)


class CopyCheckTest(unittest.TestCase):
    ARTICLE = ("금융당국은 증시 급락 시 반대매매가 연쇄적으로 쏟아지는 것을 막기 위해 석 달 동안 "
               "반대매매를 한시적으로 억제하기로 했다고 밝혔습니다. 다만 부작용 우려도 나옵니다.")

    def test_original_wording_passes(self):
        self.assertIsNone(cg.copy_check(
            "반대매매는 빌린 돈으로 산 주식을 증권사가 강제로 파는 것이다. 주가가 크게 떨어지면 매도가 몰려 하락을 키울 수 있다.",
            self.ARTICLE))

    def test_copied_sentence_rejected(self):
        reason = cg.copy_check("당국은 반대매매가 연쇄적으로 쏟아지는 것을 막기 위해 조치를 했다.", self.ARTICLE)
        self.assertIsNotNone(reason)

    def test_whitespace_changes_do_not_hide_copy(self):
        self.assertIsNotNone(cg.copy_check("반대매매를  한시적으로   억제하기로 했다고 밝혔습니다", self.ARTICLE))


class ValidateItemTest(unittest.TestCase):
    GOOD = {"explanation": "설명", "question": "Q?", "choices": ["a", "b", "c", "d"],
            "answer_index": 2, "answer_explanation": "해설"}

    def test_good(self):
        self.assertIsNone(cg.validate_item(dict(self.GOOD)))

    def test_bad_shapes(self):
        self.assertIsNotNone(cg.validate_item({**self.GOOD, "choices": ["a", "b", "c"]}))
        self.assertIsNotNone(cg.validate_item({**self.GOOD, "choices": ["a", "a ", "c", "d"]}))
        self.assertIsNotNone(cg.validate_item({**self.GOOD, "answer_index": 4}))
        self.assertIsNotNone(cg.validate_item({**self.GOOD, "explanation": "가" * 400}))
        self.assertIsNotNone(cg.validate_item({**self.GOOD, "answer_explanation": ""}))

    def test_excerpt_centers_on_term(self):
        text = "가" * 2000 + "반대매매" + "나" * 2000
        ex = cg.excerpt(text, ["반대매매"], size=100)
        self.assertIn("반대매매", ex)
        self.assertEqual(len(ex), 100)


class YtnParseTest(unittest.TestCase):
    LIST = """
      <a href="https://www.ytn.co.kr/_ln/0102_202611091818019295"><img src="x.jpg"></a>
      <a href="https://www.ytn.co.kr/_ln/0102_202611091818019295">석 달간 반대매매 한시 억제...&quot;부작용&quot;</a>
      <a href="https://www.ytn.co.kr/_ln/0102_202611091808026022">산업장관 발언</a>
      <a href="https://www.ytn.co.kr/_comm/other">무관</a>"""
    ARTICLE = """<meta property="article:published_time" content="2026-11-09T18:18:00+09:00">
      <meta property="og:title" content="석 달간 반대매매 한시 억제">
      <div id="CmAdContent" class="paragraph"><span>첫 문단입니다. 금융당국이 반대매매를 억제합니다.<br/><br/>
      둘째 문단 <div class="ad">광고</div> 입니다.</span></div><div>본문 밖</div>"""

    def test_list_dedupes_and_keeps_titles(self):
        entries = ytn.parse_list_page(self.LIST, "경제")
        self.assertEqual([e.article_id for e in entries], ["0102_202611091818019295", "0102_202611091808026022"])
        self.assertEqual(entries[0].title, '석 달간 반대매매 한시 억제..."부작용"')
        self.assertEqual(entries[0].published, "20261109181801")

    def test_article_body_extracted_with_nested_divs(self):
        r = ytn.parse_article_page(self.ARTICLE, "u")
        self.assertIn("첫 문단입니다", r["text"])
        self.assertIn("광고", r["text"])          # 본문 안쪽 중첩 div 는 포함
        self.assertNotIn("본문 밖", r["text"])
        self.assertEqual(r["published"], "2026-11-09T18:18:00+09:00")

    def test_missing_body_raises(self):
        with self.assertRaises(ytn.ArticleFetchError):
            ytn.parse_article_page("<html></html>", "u")


if __name__ == "__main__":
    unittest.main()
