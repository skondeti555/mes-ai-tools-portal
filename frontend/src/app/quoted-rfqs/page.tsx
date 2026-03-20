"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

interface RowData {
  [key: string]: string | number;
}

const QUOTED_COL = "Quoted Supplier Count";
const HEADER_SCAN_ROWS = 80;

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

// Convert Excel serial date number to formatted date string
function excelDateToString(val: string | number): string {
  if (val === "" || val === undefined || val === null) return "";
  const num = Number(val);
  if (isNaN(num) || num < 1000) return String(val); // not a serial date
  // Excel serial date: days since 1899-12-30
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + num * 86400000);
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
          <div className="flex items-center gap-3 mb-4">
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
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left table-fixed">
              <colgroup>
                {headers.map((h) => (
                  <col
                    key={h}
                    className={
                      NARROW_COLS.has(h.toLowerCase())
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
                <tr className="bg-dark border-b border-border">
                  {headers.map((h) => (
                    <th
                      key={h}
                      className={`px-2 py-2 text-text-secondary font-semibold text-xs uppercase tracking-wider ${
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
                    className="border-b border-border hover:bg-card-hover transition-colors"
                  >
                    {headers.map((h) => {
                      const isDate = h.toLowerCase().includes("date");
                      const isNarrow = NARROW_COLS.has(h.toLowerCase());
                      const raw = row[h] ?? "";
                      const display = isDate ? excelDateToString(raw) : raw;
                      return (
                        <td
                          key={h}
                          className={`px-2 py-2 text-text-primary text-wrap break-words ${
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
