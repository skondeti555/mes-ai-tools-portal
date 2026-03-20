"""Integration tests for pipeline steps in api.lib.rfq_pipeline."""

import pandas as pd
import pytest

from api.lib.rfq_pipeline import step2_split_by_country


class TestStep2SplitByCountry:
    def test_india_gets_correct_rows(self, sample_master_df, tmp_path):
        step2_split_by_country(sample_master_df, tmp_path)
        assert (tmp_path / "India.xlsx").exists()
        df = pd.read_excel(tmp_path / "India.xlsx")
        rfqs = set(df["RFQ #"].astype(str))
        assert "1001" in rfqs  # Open Floated Country = "IN"
        assert "1005" in rfqs  # Open Floated Country = "IN, CN"

    def test_china_gets_correct_rows(self, sample_master_df, tmp_path):
        step2_split_by_country(sample_master_df, tmp_path)
        assert (tmp_path / "China.xlsx").exists()
        df = pd.read_excel(tmp_path / "China.xlsx")
        rfqs = set(df["RFQ #"].astype(str))
        assert "1002" in rfqs  # Open Floated Country = "CN"
        assert "1005" in rfqs  # Open Floated Country = "IN, CN"

    def test_multi_code_row_appears_in_both_countries(self, sample_master_df, tmp_path):
        """Row 1005 has 'IN, CN' — should appear in both India and China."""
        step2_split_by_country(sample_master_df, tmp_path)
        india_df = pd.read_excel(tmp_path / "India.xlsx")
        china_df = pd.read_excel(tmp_path / "China.xlsx")
        assert "1005" in set(india_df["RFQ #"].astype(str))
        assert "1005" in set(china_df["RFQ #"].astype(str))

    def test_vietnam_gets_correct_rows(self, sample_master_df, tmp_path):
        step2_split_by_country(sample_master_df, tmp_path)
        assert (tmp_path / "Vietnam.xlsx").exists()
        df = pd.read_excel(tmp_path / "Vietnam.xlsx")
        rfqs = set(df["RFQ #"].astype(str))
        assert "1004" in rfqs  # Open Floated Country = "VN"
        assert "1006" in rfqs  # Open Floated Country = "MX;VN"

    def test_mexico_excludes_saltillo(self, sample_master_df_with_supplier, tmp_path):
        """Row 1003 has _InvitedSupplier='Metrics Works Saltillo' — should be excluded from Mexico."""
        step2_split_by_country(sample_master_df_with_supplier, tmp_path)
        if (tmp_path / "Mexico.xlsx").exists():
            df = pd.read_excel(tmp_path / "Mexico.xlsx")
            rfqs = set(df["RFQ #"].astype(str))
            assert "1003" not in rfqs
        # If Mexico.xlsx doesn't exist, the exclusion removed all Mexico rows — also valid

    def test_mexico_keeps_non_saltillo(self, sample_master_df_with_supplier, tmp_path):
        step2_split_by_country(sample_master_df_with_supplier, tmp_path)
        assert (tmp_path / "Mexico.xlsx").exists()
        df = pd.read_excel(tmp_path / "Mexico.xlsx")
        rfqs = set(df["RFQ #"].astype(str))
        assert "1006" in rfqs  # MX;VN with non-Saltillo supplier

    def test_output_has_comments_column(self, sample_master_df, tmp_path):
        step2_split_by_country(sample_master_df, tmp_path)
        df = pd.read_excel(tmp_path / "India.xlsx")
        assert "Comments" in df.columns

    def test_internal_columns_dropped(self, sample_master_df_with_supplier, tmp_path):
        """Columns starting with '_' should not appear in output."""
        step2_split_by_country(sample_master_df_with_supplier, tmp_path)
        df = pd.read_excel(tmp_path / "India.xlsx")
        underscore_cols = [c for c in df.columns if c.startswith("_")]
        assert underscore_cols == []

    def test_missing_column_raises(self, tmp_path):
        df = pd.DataFrame({"RFQ #": ["1001"], "Some Column": ["val"]})
        with pytest.raises(ValueError, match="Open Floated Country"):
            step2_split_by_country(df, tmp_path)

    def test_empty_country_skips_file(self, tmp_path):
        """If no rows match Vietnam, Vietnam.xlsx should not be created."""
        df = pd.DataFrame({
            "RFQ #": ["1001"],
            "Open Floated Country": ["IN"],
            "Customer Company": ["Acme"],
        })
        step2_split_by_country(df, tmp_path)
        assert not (tmp_path / "Vietnam.xlsx").exists()
