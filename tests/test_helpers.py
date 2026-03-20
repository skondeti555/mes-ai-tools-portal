"""Tests for pure helper functions in api.lib.rfq_pipeline."""

from datetime import date
import pytest
from api.lib.rfq_pipeline import cell_has_code, upcoming_monday, nice_date_str, _pick_engine


# ── cell_has_code ──────────────────────────────────────────────

class TestCellHasCode:
    def test_simple_match(self):
        assert cell_has_code("IN", "IN") is True

    def test_comma_delimited(self):
        assert cell_has_code("IN, CN", "CN") is True

    def test_semicolon_delimited(self):
        assert cell_has_code("MX;IN;VN", "VN") is True

    def test_no_match(self):
        assert cell_has_code("IN, CN", "MX") is False

    def test_empty_string(self):
        assert cell_has_code("", "IN") is False

    def test_none_cell(self):
        assert cell_has_code(None, "IN") is False

    def test_case_insensitive(self):
        assert cell_has_code("in, cn", "CN") is True

    def test_partial_no_match(self):
        """'INDIA' should NOT match code 'IN' — tokenization must split on delimiters."""
        assert cell_has_code("INDIA", "IN") is False

    def test_mixed_delimiters(self):
        assert cell_has_code("IN; CN, MX VN", "MX") is True

    def test_single_code_with_whitespace(self):
        assert cell_has_code("  VN  ", "VN") is True


# ── upcoming_monday ────────────────────────────────────────────

class TestUpcomingMonday:
    def test_from_tuesday(self):
        # 2026-03-17 is a Tuesday
        assert upcoming_monday(date(2026, 3, 17)) == date(2026, 3, 23)

    def test_from_monday_returns_next_monday(self):
        # 2026-03-16 is a Monday — should return NEXT Monday, not today
        assert upcoming_monday(date(2026, 3, 16)) == date(2026, 3, 23)

    def test_from_sunday(self):
        # 2026-03-22 is a Sunday — next day is Monday
        assert upcoming_monday(date(2026, 3, 22)) == date(2026, 3, 23)

    def test_from_saturday(self):
        # 2026-03-21 is a Saturday
        assert upcoming_monday(date(2026, 3, 21)) == date(2026, 3, 23)

    def test_from_wednesday(self):
        # 2026-03-18 is a Wednesday
        assert upcoming_monday(date(2026, 3, 18)) == date(2026, 3, 23)

    def test_from_friday(self):
        # 2026-03-20 is a Friday
        assert upcoming_monday(date(2026, 3, 20)) == date(2026, 3, 23)


# ── nice_date_str ──────────────────────────────────────────────

class TestNiceDateStr:
    def test_standard_date(self):
        assert nice_date_str(date(2026, 3, 17)) == "Mar 17 2026"

    def test_single_digit_day_no_zero_pad(self):
        assert nice_date_str(date(2026, 1, 5)) == "Jan 5 2026"

    def test_december(self):
        assert nice_date_str(date(2025, 12, 25)) == "Dec 25 2025"


# ── _pick_engine ───────────────────────────────────────────────

class TestPickEngine:
    def test_xlsb_returns_pyxlsb(self):
        assert _pick_engine("data.xlsb") == "pyxlsb"

    def test_xlsx_returns_none(self):
        assert _pick_engine("data.xlsx") is None

    def test_case_insensitive(self):
        assert _pick_engine("DATA.XLSB") == "pyxlsb"

    def test_csv_returns_none(self):
        assert _pick_engine("report.csv") is None

    def test_path_with_directory(self):
        assert _pick_engine("/some/path/file.xlsb") == "pyxlsb"
