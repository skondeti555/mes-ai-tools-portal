"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

interface RowData {
  [key: string]: string | number;
}

const QUOTED_COL = "Quoted Supplier Count";
const HEADER_SCAN_ROWS = 80;

// Synthetic column (not present in the uploaded sheet) holding the per-RFQ note.
const COMMENT_COL = "Comment";
// localStorage key for the shared access code so users don't re-enter it each visit.
const ACCESS_CODE_KEY = "quotedRfqsAccessCode";

// Columns to display (matching original Electron app) + Process
const DISPLAY_COLS = [
  "RFQ #",
  "Customer Company",
  "Project Name",
  "Quoted Supplier Count",
  "Invited Supplier Count",
  "Commodity",
  "Process",
  "Open Floated Country",
  "Need By Date",
];

// Narrow columns that only hold numbers or short text
const NARROW_COLS = new Set([
  "quoted supplier count",
  "invited supplier count",
]);

// Convert an Excel serial date number to a real JS Date.
// Returns null when the value isn't a serial date (so callers can fall back to raw text).
function excelSerialToDate(val: string | number): Date | null {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  if (isNaN(num) || num < 1000) return null; // not a serial date
  // Excel serial date: days since 1899-12-30
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + num * 86400000);
}

// Convert Excel serial date number to formatted date string
function excelDateToString(val: string | number): string {
  if (val === "" || val === undefined || val === null) return "";
  const date = excelSerialToDate(val);
  if (!date) return String(val); // not a serial date
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Detect header row: scan first N rows and pick the one with the most non-empty cells.
 * Mirrors backend detect_header_row() in api/lib/rfq_pipeline.py.
 */
function detectHeaderRow(rawRows: (string | number | undefined)[][]): number {
  const scanLimit = Math.min(rawRows.length, HEADER_SCAN_ROWS);
  let bestIdx = 0;
  let bestCount = 0;
  for (let i = 0; i < scanLimit; i++) {
    const count = (rawRows[i] || []).filter(
      (cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""
    ).length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export default function QuotedRfqsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  // Per-RFQ comments (RFQ # -> text), shared across the team via the backend.
  const [comments, setComments] = useState<Record<string, string>>({});
  const [accessCode, setAccessCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [commentsUnlocked, setCommentsUnlocked] = useState(false);
  const [commentsError, setCommentsError] = useState("");

  // The actual header name for the RFQ # column (casing comes from the sheet).
  const rfqKey = headers.find((h) => h.toLowerCase() === "rfq #");

  // Fetch all comments with the given code. Returns true on success (valid code).
  const loadComments = useCallback(async (code: string): Promise<boolean> => {
    setCommentsError("");
    try {
      const res = await fetch("/api/rfq_comments", {
        headers: { "X-Access-Code": code },
      });
      if (res.status === 401) {
        // Only surface an error if the user actually typed a code; a silent 401
        // on the initial empty-code probe just means a code is required.
        if (code) setCommentsError("Incorrect access code.");
        return false;
      }
      if (!res.ok) {
        setCommentsError("Could not load comments. Try again later.");
        return false;
      }
      const data: Record<string, string> = await res.json();
      setComments(data ?? {});
      setCommentsUnlocked(true);
      return true;
    } catch {
      setCommentsError("Could not reach the comments server.");
      return false;
    }
  }, []);

  // On mount, try to load comments. With no server-side code configured this
  // succeeds with an empty code (open access); otherwise it returns 401 and the
  // unlock box appears. A previously saved code is reused if present.
  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(ACCESS_CODE_KEY)
        : null;
    setAccessCode(saved ?? "");
    loadComments(saved ?? "");
  }, [loadComments]);

  const handleUnlock = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;
    const ok = await loadComments(code);
    if (ok) {
      setAccessCode(code);
      window.localStorage.setItem(ACCESS_CODE_KEY, code);
      setCodeInput("");
    }
  }, [codeInput, loadComments]);

  // Persist a single comment (blank clears it). Optimistically updates local state.
  const saveComment = useCallback(
    async (rfqNumber: string, comment: string) => {
      const key = String(rfqNumber);
      setComments((prev) => {
        const next = { ...prev };
        if (comment.trim()) next[key] = comment;
        else delete next[key];
        return next;
      });
      try {
        const res = await fetch("/api/rfq_comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Code": accessCode,
          },
          body: JSON.stringify({ rfqNumber: key, comment }),
        });
        if (res.status === 503) {
          setCommentsError(
            "Comments storage isn't set up yet — add the Upstash Redis integration in Vercel, then redeploy."
          );
        } else if (res.status === 401) {
          setCommentsError("Saving requires the correct access code.");
        } else if (!res.ok) {
          setCommentsError("Failed to save comment. Please try again.");
        } else {
          setCommentsError("");
        }
      } catch {
        setCommentsError("Failed to save comment — server unreachable.");
      }
    },
    [accessCode]
  );

  const parseFile = useCallback((f: File) => {
    setLoading(true);
    setErrorMsg("");
    setHeaders([]);
    setRows([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        // Try "RFQs" sheet first, fall back to first sheet
        const sheetName = wb.SheetNames.includes("RFQs")
          ? "RFQs"
          : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        // Read as array-of-arrays to detect header row
        const rawRows: (string | number | undefined)[][] =
          XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rawRows.length === 0) {
          setErrorMsg("No data found in the uploaded file.");
          setLoading(false);
          return;
        }

        const headerIdx = detectHeaderRow(rawRows);
        const headerRow = rawRows[headerIdx].map((c) =>
          String(c ?? "").trim()
        );

        // Build data rows as objects keyed by header names
        const dataRows = rawRows.slice(headerIdx + 1);
        const json: RowData[] = dataRows
          .filter((row) => row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""))
          .map((row) => {
            const obj: RowData = {};
            headerRow.forEach((h, i) => {
              if (h) obj[h] = row[i] ?? "";
            });
            return obj;
          });

        // Find the quoted supplier count column (case-insensitive)
        const quotedKey = headerRow.find(
          (c) => c.toLowerCase() === QUOTED_COL.toLowerCase()
        );

        if (!quotedKey) {
          setErrorMsg(
            `Column "${QUOTED_COL}" not found. Available columns: ${headerRow.filter(Boolean).join(", ")}`
          );
          setLoading(false);
          return;
        }

        setTotalRows(json.length);
        const filtered = json.filter((row) => {
          const val = Number(row[quotedKey]);
          return !isNaN(val) && val >= 1;
        });

        // Only show display columns that exist in the data
        const availableDisplayCols = DISPLAY_COLS.filter((col) =>
          headerRow.some((h) => h.toLowerCase() === col.toLowerCase())
        );
        // Map to actual header casing
        const displayHeaders = availableDisplayCols.map(
          (col) => headerRow.find((h) => h.toLowerCase() === col.toLowerCase())!
        );
        // Append the synthetic Comment column (not present in the uploaded sheet).
        displayHeaders.push(COMMENT_COL);

        setHeaders(displayHeaders);
        setRows(filtered);
      } catch {
        setErrorMsg("Failed to parse the file. Please upload a valid Excel file.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      if (
        !f.name.toLowerCase().endsWith(".xlsx") &&
        !f.name.toLowerCase().endsWith(".xls") &&
        !f.name.toLowerCase().endsWith(".csv")
      ) {
        setErrorMsg("Please select an Excel or CSV file.");
        return;
      }
      setFile(f);
      setErrorMsg("");
      parseFile(f);
    },
    [parseFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleBrowse = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleFile(f);
    };
    input.click();
  }, [handleFile]);

  const exportToExcel = useCallback(async () => {
    if (rows.length === 0) return;
    // Dynamic import keeps the heavy exceljs bundle out of the initial page load
    // and avoids any SSR bundling issues.
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Quoted RFQs");

    const thinBorder = {
      top: { style: "thin" as const, color: { argb: "FFB0B0B0" } },
      left: { style: "thin" as const, color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin" as const, color: { argb: "FFB0B0B0" } },
      right: { style: "thin" as const, color: { argb: "FFB0B0B0" } },
    };

    // Header row — bold white text on MES red, centered
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE63946" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder;
    });

    // Data rows
    rows.forEach((row) => {
      const values = headers.map((h) => {
        if (h === COMMENT_COL) {
          return rfqKey ? comments[String(row[rfqKey] ?? "")] ?? "" : "";
        }
        const raw = row[h] ?? "";
        if (h.toLowerCase().includes("date")) {
          return excelSerialToDate(raw) ?? raw;
        }
        return raw;
      });
      const dataRow = ws.addRow(values);
      dataRow.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        cell.border = thinBorder;
        if (header?.toLowerCase().includes("date") && cell.value instanceof Date) {
          cell.numFmt = "mmm d, yyyy";
          cell.alignment = { horizontal: "center" };
        } else if (NARROW_COLS.has(header?.toLowerCase() ?? "")) {
          cell.alignment = { horizontal: "center" };
        }
      });
    });

    // Freeze the header row
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Auto-fit column widths from header + cell content (clamped)
    ws.columns.forEach((col, i) => {
      const header = headers[i] ?? "";
      let maxLen = header.length;
      rows.forEach((row) => {
        let text: string;
        if (header === COMMENT_COL) {
          text = rfqKey ? comments[String(row[rfqKey] ?? "")] ?? "" : "";
        } else if (header.toLowerCase().includes("date")) {
          text = excelDateToString(row[header] ?? "");
        } else {
          text = String(row[header] ?? "");
        }
        if (text.length > maxLen) maxLen = text.length;
      });
      col.width = Math.min(Math.max(maxLen + 2, 10), 50);
    });

    // Autofilter over the full header range
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };

    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quoted_RFQs_${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [headers, rows, comments, rfqKey]);

  return (
    <div className="max-w-[1100px] mx-auto">
      {/* Back navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-red text-sm mb-6 no-underline transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M10.5 13L5.5 8L10.5 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        Back to Tools
      </Link>

      <h2 className="text-2xl font-bold text-text-primary mb-1">
        Quoted RFQs Viewer
      </h2>
      <p className="text-text-secondary mb-6">
        Upload your RFQ Excel file to view all open RFQs that have received
        supplier quotes.
      </p>

      {/* File Upload */}
      <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-accent-red text-white rounded-full text-sm font-bold">
            1
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Select Input File
          </h3>
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-accent-red bg-accent-red/10"
              : file
              ? "border-accent-red bg-dark"
              : "border-border bg-dark hover:border-text-muted"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={handleBrowse}
        >
          {file ? (
            <div>
              <p className="text-text-primary font-medium">{file.name}</p>
              <p className="text-text-muted text-sm mt-1">
                {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
              </p>
            </div>
          ) : (
            <div>
              <svg
                className="mx-auto mb-3 text-text-muted"
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
              >
                <path
                  d="M20 6v20M12 14l8-8 8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 28v4a2 2 0 002 2h24a2 2 0 002-2v-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-text-secondary">
                Drag & drop your <strong>RFQ Excel file</strong> here
              </p>
              <p className="text-text-muted text-sm mt-1">
                or click to browse (.xlsx, .csv)
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-accent-teal/30 border-t-accent-teal rounded-full animate-spin" />
            <span className="text-text-secondary text-sm">
              Parsing file...
            </span>
          </div>
        </section>
      )}

      {/* Error */}
      {errorMsg && (
        <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
          <div className="p-3 rounded-md bg-error/15 border border-error">
            <span className="text-error text-sm font-semibold">
              Error: {errorMsg}
            </span>
          </div>
        </section>
      )}

      {/* Results Table */}
      {rows.length > 0 && (
        <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center justify-center w-7 h-7 bg-accent-red text-white rounded-full text-sm font-bold">
              2
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Results
            </h3>
            <span className="ml-auto text-sm text-text-secondary">
              <strong className="text-accent-teal">{rows.length}</strong> out of{" "}
              {totalRows} open RFQs have quotes received
            </span>
            <button
              type="button"
              onClick={exportToExcel}
              className="inline-flex items-center gap-2 bg-accent-red hover:bg-accent-red-hover text-white text-sm font-semibold px-3 py-1.5 rounded-md transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1v9m0 0L5 7m3 3l3-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export to Excel
            </button>
          </div>

          {/* Comments unlock / status bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
            {commentsUnlocked ? (
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                <span aria-hidden>💬</span> Click a note to add or edit a comment
              </span>
            ) : (
              <>
                <span className="text-text-secondary">
                  Enter the team access code to view &amp; edit comments:
                </span>
                <input
                  type="password"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUnlock();
                  }}
                  placeholder="Access code"
                  className="rounded border border-border bg-dark px-2 py-1 text-sm text-text-primary focus:border-accent-red focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="bg-accent-red hover:bg-accent-red-hover text-white text-sm font-semibold px-3 py-1 rounded-md transition-colors"
                >
                  Unlock
                </button>
              </>
            )}
            {commentsError && (
              <span className="text-error">{commentsError}</span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
            <table className="w-full text-sm text-left table-fixed">
              <colgroup>
                {headers.map((h) => (
                  <col
                    key={h}
                    className={
                      h === COMMENT_COL
                        ? "w-[220px]"
                        : NARROW_COLS.has(h.toLowerCase())
                        ? "w-[70px]"
                        : h.toLowerCase() === "rfq #"
                        ? "w-[95px]"
                        : h.toLowerCase() === "need by date"
                        ? "w-[100px]"
                        : h.toLowerCase() === "commodity" || h.toLowerCase() === "process"
                        ? "w-[100px]"
                        : h.toLowerCase() === "open floated country"
                        ? "w-[90px]"
                        : ""
                    }
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  {headers.map((h) => (
                    <th
                      key={h}
                      className={`px-2 py-2 text-gray-700 font-semibold text-xs uppercase tracking-wider ${
                        NARROW_COLS.has(h.toLowerCase()) ? "text-center" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-200 hover:bg-gray-100 transition-colors ${
                      i % 2 === 1 ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    {headers.map((h) => {
                      if (h === COMMENT_COL) {
                        const rfqNo = rfqKey ? String(row[rfqKey] ?? "") : "";
                        return (
                          <td key={h} className="px-2 py-1.5 align-top">
                            {commentsUnlocked ? (
                              <textarea
                                key={`${rfqNo}:${comments[rfqNo] ?? ""}`}
                                rows={2}
                                defaultValue={comments[rfqNo] ?? ""}
                                placeholder="Add a note…"
                                onBlur={(e) => {
                                  const val = e.target.value;
                                  if ((comments[rfqNo] ?? "") !== val) {
                                    saveComment(rfqNo, val);
                                  }
                                }}
                                className="w-full resize-y rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-accent-red focus:outline-none"
                              />
                            ) : (
                              <span className="text-gray-400 text-xs italic">
                                {comments[rfqNo] ?? "🔒"}
                              </span>
                            )}
                          </td>
                        );
                      }
                      const isDate = h.toLowerCase().includes("date");
                      const isNarrow = NARROW_COLS.has(h.toLowerCase());
                      const raw = row[h] ?? "";
                      const display = isDate ? excelDateToString(raw) : raw;
                      return (
                        <td
                          key={h}
                          className={`px-2 py-2 text-gray-900 text-wrap break-words ${
                            isNarrow ? "text-center" : ""
                          }`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* No results after parsing */}
      {!loading && !errorMsg && file && rows.length === 0 && (
        <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
          <p className="text-text-muted text-sm italic">
            No RFQs with quoted suppliers found in this file.
          </p>
        </section>
      )}
    </div>
  );
}
