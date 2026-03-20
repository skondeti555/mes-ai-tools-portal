"""
RFQ Pipeline — refactored for web deployment.

1) Build OpenRFQ.csv (18 cols) from uploaded Excel (sheet: RFQs)
2) Split by Open Floated Country into country workbooks
3) Format each country workbook into templated 'Open RFQ Report <date> - <country>.xlsx'

All business logic preserved from All_in_onescript_v1.py.
Only I/O boundaries changed: functions accept explicit Path parameters.
"""

import re
from copy import copy
from pathlib import Path
from datetime import date, timedelta
from typing import List, Optional

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, PatternFill
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.formatting.rule import FormulaRule

# ======================================================
# =================== CONFIG ===========================
# ======================================================

SHEET_NAME = "RFQs"

FINAL_COLUMNS = [
    "RFQ #",
    "Customer Company",
    "Need By Date",
    "Creation Date",
    "Sales Account Manager",
    "RFQ Coordinator",
    "Project Name",
    "Invited Supplier Count",
    "Quoted Supplier Count",
    "Commodity",
    "Process",
    "RFQ Type / Classification",
    "Total Parts",
    "Total Quantity",
    "Floated Country",
    "Open Floated Country",
    "Standards Requirement",
    "Internal Comments",
]

SOURCE_TO_FINAL = {
    "RFQ #": "RFQ #",
    "Customer Company": "Customer Company",
    "Need By Date": "Need By Date",
    "Creation Date": "Creation Date",
    "Sales Account Manager": "Sales Account Manager",
    "RFQ Coordinator": "RFQ Coordinator",
    "Project Name": "Project Name",
    "Invited Supplier Count": "Invited Supplier Count",
    "Quoted Supplier Count": "Quoted Supplier Count",
    "Commodity": "Commodity",
    "Process": "Process",
    "RFQ Type / Classification": "RFQ Type / Classification",
    "Total Parts": "Total Parts",
    "Total Quantity": "Total Quantity",
    "Floated Country": "Floated Country",
    "Open Floated Country": "Open Floated Country",
    "Standards Requirement": "Standards Requirement",
    "Internal Comments": "Internal Comments",
}

COUNTRY_COL = "Open Floated Country"
COUNTRY_MAP = {
    "India": "IN",
    "China": "CN",
    "Mexico": "MX",
    "Vietnam": "VN",
}

COUNTRIES = {
    "India":   {"report": "India.xlsx",   "template": "Mexico_Template.xlsx"},
    "China":   {"report": "China.xlsx",   "template": "Mexico_Template.xlsx"},
    "Mexico":  {"report": "Mexico.xlsx",  "template": "Mexico_Template.xlsx"},
    "Vietnam": {"report": "Vietnam.xlsx", "template": "Mexico_Template.xlsx"},
}
NEED_BY_COL = "Need By Date"
HEADER_SCAN_ROWS = 80
MIN_HEADER_MATCHES = 4

# ======================================================
# ================== HELPERS ===========================
# ======================================================


def _pick_engine(path: str):
    """Pick Excel engine dynamically."""
    p = str(path).lower()
    if p.endswith(".xlsb"):
        return "pyxlsb"
    return None


def detect_header_row(path: str, sheet_name: str, scan_rows: int = 25) -> int:
    """Find the row index (0-based) with the maximum number of non-null cells."""
    engine = _pick_engine(path)
    raw = pd.read_excel(path, sheet_name=sheet_name,
                        header=None, dtype=str, engine=engine)
    head = raw.head(scan_rows)
    return int(head.notna().sum(axis=1).idxmax())


def load_excel_with_detected_header(path: Path, sheet_name: str) -> pd.DataFrame:
    """Load sheet using detected header row, return DataFrame with trimmed headers."""
    engine = _pick_engine(str(path))
    header_idx = detect_header_row(str(path), sheet_name)
    df = pd.read_excel(path, sheet_name=sheet_name,
                       header=header_idx, dtype=str, engine=engine)
    if isinstance(df, dict):
        df = df[next(iter(df))]
    df.columns = [c.strip() if isinstance(c, str) else c for c in df.columns]
    return df


def cell_has_code(cell: str, code: str) -> bool:
    """
    Check if two-letter country code is present; handle commas/spaces/semicolons.
    Examples: 'IN, CN' or 'MX;IN;VN'
    """
    if not cell:
        return False
    cleaned = cell.replace(",", " ").replace(";", " ").strip().upper()
    tokens = [t for t in cleaned.split() if t]
    return code.upper() in tokens


# ---------- Template helpers (openpyxl) ----------


def upcoming_monday(today=None):
    if today is None:
        today = date.today()
    days_ahead = (0 - today.weekday()) % 7  # Monday=0..Sunday=6
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def nice_date_str(d: date) -> str:
    return d.strftime("%b ") + str(d.day) + d.strftime(" %Y")


def detect_header_row_in_template(ws, known_headers: set, scan_rows=HEADER_SCAN_ROWS, min_matches=MIN_HEADER_MATCHES):
    max_scan = min(scan_rows, ws.max_row)
    for r in range(1, max_scan + 1):
        vals = [
            (str(ws.cell(row=r, column=c).value).strip() if ws.cell(
                row=r, column=c).value is not None else "")
            for c in range(1, ws.max_column + 1)
        ]
        matches = sum(1 for v in vals if v in known_headers)
        if matches >= min_matches:
            return r
    # fallback: look for RFQ tokens
    for r in range(1, max_scan + 1):
        vals = [
            (str(ws.cell(row=r, column=c).value).strip() if ws.cell(
                row=r, column=c).value is not None else "")
            for c in range(1, ws.max_column + 1)
        ]
        if any(v.upper() in {"RFQ #", "RFQ#"} for v in vals):
            return r
    raise RuntimeError("Could not detect header row in template. "
                       "Ensure template headers match the report column names.")


def read_template_headers(ws, header_row: int):
    headers = []
    for c in range(1, ws.max_column + 1):
        v = ws.cell(row=header_row, column=c).value
        headers.append((c, (str(v).strip() if v is not None else "")))
    while headers and headers[-1][1] == "":
        headers.pop()
    return headers


def update_cell_a5(ws, date_str: str, country: str | None = None):
    val = ws["A5"].value
    if isinstance(val, str):
        original = val
        # Replace country name if provided (e.g. "Mexico" → "India")
        if country:
            for c in ("India", "China", "Mexico", "Vietnam"):
                if c.lower() in original.lower():
                    new_val = re.sub(re.escape(c), country, original, flags=re.IGNORECASE)
                    original = new_val
                    break
        new_val = re.sub(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b",
                         date_str, original)
        new_val = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", date_str, new_val)
        new_val = re.sub(r"\b\d{4}-\d{1,2}-\d{1,2}\b", date_str, new_val)
        ws["A5"].value = new_val if new_val != original else (
            original.strip() + " " + date_str).strip()
    else:
        ws["A5"].value = date_str


def _prototype_styles_for_columns(ws, template_row: int):
    proto = {}
    for c in range(1, ws.max_column + 1):
        tc = ws.cell(row=template_row, column=c)
        proto[c] = {
            "font": copy(tc.font),
            "fill": copy(tc.fill),
            "border": copy(tc.border),
            "alignment": copy(tc.alignment),
            "number_format": tc.number_format,
            "protection": copy(tc.protection),
        }
    return proto


def _apply_style(cell, s):
    if not s:
        return
    cell.font = copy(s["font"])
    cell.fill = copy(s["fill"])
    cell.border = copy(s["border"])
    cell.alignment = copy(s["alignment"])
    cell.number_format = s["number_format"]
    cell.protection = copy(s["protection"])


def write_dataframe(ws, df: pd.DataFrame, template_headers, start_row: int, force_wrap_columns=None):
    header_to_col = {h: idx for idx, h in template_headers if h}
    ordered_headers = [h for _, h in template_headers if h]
    df_cols = [c for c in ordered_headers if c in df.columns]

    col_styles = _prototype_styles_for_columns(ws, start_row)
    force_wrap_columns = set(force_wrap_columns or [])

    r = start_row
    for _, row in df.iterrows():
        for col_name in df_cols:
            c = header_to_col[col_name]
            cell = ws.cell(row=r, column=c)

            if (r > ws.max_row) or (not cell.has_style):
                _apply_style(cell, col_styles.get(c))

            if col_name in force_wrap_columns:
                current = cell.alignment or Alignment()
                cell.alignment = Alignment(
                    wrap_text=True,
                    horizontal=current.horizontal,
                    vertical=current.vertical,
                    text_rotation=current.text_rotation,
                    shrink_to_fit=current.shrink_to_fit,
                    indent=current.indent,
                )

            cell.value = row[col_name]
        r += 1


def add_need_by_cf(ws, template_headers, data_start: int, n_rows: int, monday: date, need_by_header=NEED_BY_COL):
    """
    CF over A:Q:
      - GOLD (Accent 4, Lighter 60%) if (Monday - 14) <= NeedBy <= Monday
      - ORANGE if NeedBy < (Monday - 14)
    """
    header_to_col = {h: idx for idx, h in template_headers if h}
    if need_by_header not in header_to_col or n_rows <= 0:
        return

    need_col_idx = header_to_col[need_by_header]
    need_col_letter = get_column_letter(need_col_idx)

    start_row = data_start
    end_row = data_start + n_rows - 1
    cf_range = f"B{start_row}:Q{end_row}"

    y, m, d = monday.year, monday.month, monday.day
    nb_cell = f"${need_col_letter}{start_row}"
    value_expr = f"IF(ISNUMBER({nb_cell}), {nb_cell}, DATEVALUE({nb_cell}))"
    monday_expr = f"DATE({y},{m},{d})"
    monday_minus_14_expr = f"{monday_expr}-14"

    formula_gold = f"=AND({value_expr}>={monday_minus_14_expr}, {value_expr}<={monday_expr})"
    gold_fill = PatternFill(
        fill_type="solid", start_color="FFF2CC", end_color="FFF2CC")
    rule_gold = FormulaRule(formula=[formula_gold], fill=gold_fill)

    formula_orange = f"={value_expr}<{monday_minus_14_expr}"
    orange_fill = PatternFill(
        fill_type="solid", start_color="FFFFA500", end_color="FFFFA500")
    rule_orange = FormulaRule(formula=[formula_orange], fill=orange_fill)

    ws.conditional_formatting.add(cf_range, rule_gold)
    ws.conditional_formatting.add(cf_range, rule_orange)


def enable_autofit_wrapped_rows(ws, start_row: int, n_rows: int, col_range: str = "A:Q"):
    """
    Makes long text visible by:
      1) wrap_text=True on cells within col_range for data rows.
      2) resetting row heights to 'auto' so Excel auto-expands on open.
    """
    if n_rows <= 0:
        return
    col_start, col_end = col_range.split(":")
    c1 = column_index_from_string(col_start)
    c2 = column_index_from_string(col_end)
    end_row = start_row + n_rows - 1

    for r in range(start_row, end_row + 1):
        for c in range(c1, c2 + 1):
            cell = ws.cell(row=r, column=c)
            current = cell.alignment or Alignment()
            if not current.wrap_text:
                cell.alignment = Alignment(
                    wrap_text=True,
                    horizontal=current.horizontal,
                    vertical=current.vertical,
                    text_rotation=current.text_rotation,
                    shrink_to_fit=current.shrink_to_fit,
                    indent=current.indent,
                )
        ws.row_dimensions[r].height = None


# ======================================================
# ================== STEPS =============================
# ======================================================


def step1_build_master_csv(input_path: Path, output_dir: Path) -> pd.DataFrame:
    """Create sorted 18-column OpenRFQ.csv from the Excel."""
    if not input_path.exists():
        raise FileNotFoundError(f"Excel not found: {input_path}")

    df = load_excel_with_detected_header(input_path, SHEET_NAME)

    out = pd.DataFrame(columns=FINAL_COLUMNS)
    for final_col in FINAL_COLUMNS:
        srcs = [src for src, dest in SOURCE_TO_FINAL.items() if dest == final_col]
        if srcs and srcs[0] in df.columns:
            out[final_col] = df[srcs[0]].astype(str)
        else:
            out[final_col] = ""

    out = out.fillna("").map(
        lambda x: x.strip() if isinstance(x, str) else x)
    if "Need By Date" in out.columns:
        out["_SortNeedBy"] = pd.to_datetime(
            out["Need By Date"], errors="coerce", format="mixed")
        out = out.sort_values(by="_SortNeedBy", ascending=True,
                              na_position="last").drop(columns="_SortNeedBy")

    csv_path = output_dir / "OpenRFQ.csv"
    out.to_csv(csv_path, index=False, encoding="utf-8-sig")

    # Attach temporary column for Mexico filtering only (not written to CSV)
    if "Invited Supplier" in df.columns:
        out["_InvitedSupplier"] = df["Invited Supplier"].reset_index(drop=True).astype(str).fillna("")
    else:
        out["_InvitedSupplier"] = ""

    return out


def step2_split_by_country(master_df: pd.DataFrame, output_dir: Path) -> None:
    """Produce country workbooks from master_df based on COUNTRY_MAP and COUNTRY_COL."""
    if COUNTRY_COL not in master_df.columns:
        raise ValueError(
            f"Expected column '{COUNTRY_COL}' not found in master CSV.")

    for country_name, code in COUNTRY_MAP.items():
        mask = master_df[COUNTRY_COL].apply(lambda x: cell_has_code(x, code))
        subset = master_df[mask].copy()
        if country_name == "Mexico" and "_InvitedSupplier" in subset.columns:
            excl = subset["_InvitedSupplier"].fillna("").str.strip().str.lower()
            subset = subset[~excl.str.contains("metrics works saltillo", na=False)]
        subset = subset.drop(columns=[c for c in subset.columns if c.startswith("_")], errors="ignore")
        if subset.empty:
            continue
        subset["Comments"] = ""
        out_file = output_dir / f"{country_name}.xlsx"
        subset.to_excel(out_file, index=False)


def step3_format_country_reports(data_dir: Path, template_dir: Path, output_dir: Path) -> List[Path]:
    """Format each country workbook into templated 'Open RFQ Report <date> - <country>.xlsx'."""
    monday = upcoming_monday()
    date_str = nice_date_str(monday)
    week_num = int(monday.strftime("%W"))
    generated: List[Path] = []

    for country, meta in COUNTRIES.items():
        report_path = data_dir / meta["report"]
        template_path = template_dir / meta["template"]
        out_name = f"Week {week_num} Open RFQ Report {date_str} - {country}.xlsx"
        out_path = output_dir / out_name

        if not report_path.exists():
            continue
        if not template_path.exists():
            continue

        df = pd.read_excel(report_path, dtype=str).fillna("")
        if NEED_BY_COL in df.columns:
            parsed = pd.to_datetime(
                df[NEED_BY_COL], errors="coerce", format="mixed")
            df[NEED_BY_COL] = parsed.dt.strftime(
                "%Y-%m-%d").fillna(df[NEED_BY_COL])

        wb = load_workbook(template_path)
        ws = wb.worksheets[0]

        header_row = detect_header_row_in_template(ws, set(df.columns))
        data_start = header_row + 1
        template_headers = read_template_headers(ws, header_row)

        write_dataframe(ws, df, template_headers,
                        data_start, force_wrap_columns=None)

        add_need_by_cf(ws, template_headers, data_start, len(
            df), monday, need_by_header=NEED_BY_COL)

        enable_autofit_wrapped_rows(ws, data_start, len(df), col_range="A:Q")

        update_cell_a5(ws, date_str, country)

        wb.save(out_path)
        generated.append(out_path)

    return generated


def run_pipeline(input_path: Path, template_dir: Path, work_dir: Path) -> List[Path]:
    """
    Run the full RFQ pipeline.

    Args:
        input_path: Path to the uploaded Excel file
        template_dir: Path to the directory containing *_Template.xlsx files
        work_dir: Temporary working directory for intermediate files

    Returns:
        List of paths to generated report files
    """
    # Step 1: Build master CSV
    master_df = step1_build_master_csv(input_path, work_dir)

    # Step 2: Split by country
    step2_split_by_country(master_df, work_dir)

    # Step 3: Format into templated reports
    generated = step3_format_country_reports(work_dir, template_dir, work_dir)

    return generated
