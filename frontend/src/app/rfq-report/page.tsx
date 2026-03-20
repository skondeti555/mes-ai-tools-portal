"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

export default function RfqReportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("RFQ_Reports.zip");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".xlsx") && !f.name.toLowerCase().endsWith(".xls")) {
      setErrorMsg("Please select an Excel file (.xlsx)");
      return;
    }
    setFile(f);
    setErrorMsg("");
    setStatus("idle");
    setDownloadUrl(null);
  }, []);

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
    input.accept = ".xlsx,.xls";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleFile(f);
    };
    input.click();
  }, [handleFile]);

  const handleGenerate = useCallback(async () => {
    if (!file) return;

    setStatus("uploading");
    setErrorMsg("");
    setDownloadUrl(null);

    try {
      setStatus("processing");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/rfq_generate", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try {
          detail = JSON.parse(text).detail || text;
        } catch {
          // use raw text
        }
        throw new Error(detail);
      }

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match) setDownloadName(match[1]);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  }, [file]);

  return (
    <div className="max-w-[820px] mx-auto">
      {/* Back navigation */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-red text-sm mb-6 no-underline transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.5 13L5.5 8L10.5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        Back to Tools
      </Link>

      <h2 className="text-2xl font-bold text-text-primary mb-1">
        Open RFQ Report Generator
      </h2>
      <p className="text-text-secondary mb-6">
        Upload your RFQ Excel file to generate formatted country reports.
      </p>

      {/* Section 1: File Upload */}
      <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-accent-red text-white rounded-full text-sm font-bold">
            1
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Select Input File
          </h3>
        </div>

        {/* Drop zone */}
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
                or click to browse (.xlsx)
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Generate Button */}
      <section className="bg-card border border-border rounded-[10px] p-3 mb-4">
        <button
          onClick={handleGenerate}
          disabled={!file || status === "processing" || status === "uploading"}
          className={`w-full py-4 rounded-md font-semibold text-base tracking-wide transition-all flex items-center justify-center gap-3 ${
            !file || status === "processing" || status === "uploading"
              ? "bg-accent-red/40 text-white/40 cursor-not-allowed"
              : "bg-accent-red text-white hover:bg-accent-red-hover hover:shadow-[0_0_20px_rgba(230,57,70,0.3)]"
          }`}
        >
          {status === "processing" || status === "uploading" ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            "Generate Reports"
          )}
        </button>
      </section>

      {/* Status / Results */}
      <section className="bg-card border border-border rounded-[10px] p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-7 h-7 bg-accent-red text-white rounded-full text-sm font-bold">
            2
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Results
          </h3>
        </div>

        {status === "idle" && (
          <p className="text-text-muted text-sm italic">
            Select a file and click &quot;Generate Reports&quot; to begin.
          </p>
        )}

        {(status === "uploading" || status === "processing") && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-dark border border-border">
            <span className="w-4 h-4 border-2 border-accent-teal/30 border-t-accent-teal rounded-full animate-spin" />
            <span className="text-text-secondary text-sm">
              {status === "uploading"
                ? "Uploading file..."
                : "Generating reports... This may take a moment."}
            </span>
          </div>
        )}

        {status === "done" && downloadUrl && (
          <div>
            <div className="flex items-center gap-3 p-3 rounded-md bg-success/15 border border-success mb-4">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="#2a9d8f" />
                <path d="M5 9l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-success font-semibold text-sm">
                Reports generated successfully!
              </span>
            </div>
            <a
              href={downloadUrl}
              download={downloadName}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-red text-white rounded-md font-semibold hover:bg-accent-red-hover transition-colors no-underline"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 3v10M5 9l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 14v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Download Reports (ZIP)
            </a>
          </div>
        )}

        {status === "error" && (
          <div className="p-3 rounded-md bg-error/15 border border-error">
            <span className="text-error text-sm font-semibold">
              Error: {errorMsg}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
