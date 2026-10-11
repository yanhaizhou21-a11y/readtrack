import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import { listDocuments } from "@/features/library/api/documents";
import { exportXlsx, exportPdf, exportShare } from "@/features/export/api";
import type { DocumentSummary, ExportProgressPayload, ExportResult } from "@/types";
import { listen } from "@tauri-apps/api/event";
import {
  FileSpreadsheet,
  FileText,
  Share2,
  CheckCircle2,
  FileCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { triggerHaptic } from "@/lib/haptic";

export const ExportScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [exportAll, setExportAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);

  // Export progress & result state
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [progress, setProgress] = useState<ExportProgressPayload | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLibrary = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await listDocuments();
        if (!cancelled) {
          setDocuments(res.items);
          setSelectedIds(res.items.map((d: DocumentSummary) => d.id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load document catalog");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadLibrary();

    // Listen for real-time progress events from Rust backend
    const unlistenPromise = listen<ExportProgressPayload>("export_progress", (event) => {
      if (!cancelled) {
        setProgress(event.payload);
      }
    });

    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const handleToggleDoc = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDocs = () => {
    setSelectedIds(documents.map((d: DocumentSummary) => d.id));
  };

  const handleDeselectAllDocs = () => {
    setSelectedIds([]);
  };

  const executeExport = async (format: "xlsx" | "pdf") => {
    try {
      triggerHaptic("tick");
      setExporting(format);
      setError(null);
      setExportResult(null);
      setShareSuccess(false);
      setProgress({
        jobId: "init",
        kind: format,
        percent: 5,
        stage: "initiating",
      });

      const docIdsParam = exportAll ? undefined : selectedIds;
      const result =
        format === "xlsx"
          ? await exportXlsx({ documentIds: docIdsParam })
          : await exportPdf({ documentIds: docIdsParam });

      setExportResult(result);
      triggerHaptic("success");
      setProgress({
        jobId: "done",
        kind: format,
        percent: 100,
        stage: "complete",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Export to ${format.toUpperCase()} failed`);
    } finally {
      setExporting(null);
    }
  };

  const handleShare = async () => {
    if (!exportResult) return;
    try {
      triggerHaptic("tick");
      await exportShare({ path: exportResult.path });
      triggerHaptic("success");
      setShareSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share or open exported file");
    }
  };

  const handleReset = () => {
    triggerHaptic("tick");
    setExportResult(null);
    setProgress(null);
    setError(null);
    setShareSuccess(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F9F9F7] text-[#111111] min-h-screen">
      <Header title={t("export.title")} />

      <main className="flex-1 p-4 max-w-xl mx-auto w-full space-y-6">
        {/* Newsprint Masthead Subtitle */}
        <div className="border-b-2 border-[#111111] pb-3">
          <div className="flex items-center justify-between text-[11px] font-mono tracking-widest uppercase text-neutral-600 mb-1">
            <span>{t("export.ledgerSubtitle")}</span>
            <span>{t("export.confidentialRecord")}</span>
          </div>
          <h1 className="font-serif text-2xl font-black tracking-tight text-[#111111]">
            {t("export.offlineLedger")}
          </h1>
          <p className="font-serif text-xs italic text-neutral-700 mt-1">
            {t("export.ledgerDescription")}
          </p>
        </div>

        {loading ? (
          <div className="space-y-4 pt-2">
            <LoadingSkeleton count={3} className="h-24 w-full rounded-none" />
          </div>
        ) : error && !exportResult ? (
          <ErrorState
            title="Export System Notice"
            message={error}
            actions={[{ label: "Retry", onClick: () => window.location.reload() }]}
          />
        ) : documents.length === 0 ? (
          <div className="border-2 border-[#111111] p-6 text-center bg-white space-y-3">
            <h2 className="font-serif text-base font-bold uppercase tracking-wide">
              {t("export.noPubsTitle")}
            </h2>
            <p className="font-serif text-xs text-neutral-600 max-w-sm mx-auto">
              {t("export.noPubsBody")}
            </p>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("tick");
                navigate("/library");
              }}
              className="mt-3 px-4 py-2 border-2 border-[#111111] text-xs font-mono uppercase font-bold bg-[#111111] text-white hover:bg-neutral-800 transition-colors"
            >
              {t("export.goToLibrary")}
            </button>
          </div>
        ) : exportResult ? (
          /* Result & Share Panel */
          <div className="border-2 border-[#111111] p-5 bg-white space-y-4 shadow-[4px_4px_0px_#111111]">
            <div className="flex items-center gap-2 border-b border-[#111111] pb-2 text-[#CC0000]">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="font-mono text-xs uppercase font-bold tracking-wider">
                {t("export.completeTitle")}
              </span>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase text-neutral-500">{t("export.fileName")}</div>
              <div className="font-mono text-xs font-bold text-[#111111] bg-[#F5F5F5] p-2 border border-[#111111] break-all">
                {exportResult.fileName}
              </div>

              <div className="text-[11px] font-mono uppercase text-neutral-500 pt-1">{t("export.savedLocation")}</div>
              <div className="font-mono text-[11px] text-neutral-700 bg-[#F5F5F5] p-2 border border-neutral-300 break-all">
                {exportResult.path}
              </div>
            </div>

            {shareSuccess && (
              <div className="text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-300 p-2 text-center">
                {t("export.shareSuccess")}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 border-2 border-[#111111] bg-[#111111] text-white py-2.5 px-3 font-mono text-xs font-bold uppercase hover:bg-neutral-800 active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>{t("export.shareFile")}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center justify-center gap-1.5 border-2 border-[#111111] bg-white text-[#111111] py-2.5 px-4 font-mono text-xs font-bold uppercase hover:bg-neutral-100 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t("export.newExport")}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Export Configuration Form */
          <div className="space-y-6">
            {/* Scope Selection Box */}
            <div className="border border-[#111111] bg-white p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#E5E5E0] pb-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#111111]">
                  {t("export.scopeTitle")}
                </span>
                <span className="font-mono text-[11px] text-neutral-500">
                  {exportAll
                    ? t("export.allTitles")
                    : t("export.selectedCount", { count: selectedIds.length })}
                </span>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-serif text-xs text-[#111111]">
                  <input
                    type="radio"
                    name="scope"
                    checked={exportAll}
                    onChange={() => {
                      triggerHaptic("tick");
                      setExportAll(true);
                    }}
                    className="accent-[#111111]"
                  />
                  <span>
                    {t("export.entireLibrary", { count: documents.length })}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-serif text-xs text-[#111111]">
                  <input
                    type="radio"
                    name="scope"
                    checked={!exportAll}
                    onChange={() => {
                      triggerHaptic("tick");
                      setExportAll(false);
                      setShowDocPicker(true);
                    }}
                    className="accent-[#111111]"
                  />
                  <span>{t("export.selectPublications")}</span>
                </label>
              </div>

              {/* Collapsible Document Selector */}
              {!exportAll && (
                <div className="pt-2 border-t border-[#E5E5E0] space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic("tick");
                        setShowDocPicker(!showDocPicker);
                      }}
                      className="flex items-center gap-1 text-[11px] font-mono uppercase font-bold text-neutral-700 hover:text-black"
                    >
                      {showDocPicker ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>{showDocPicker ? t("export.hideList") : t("export.showList")}</span>
                    </button>
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("tick");
                          handleSelectAllDocs();
                        }}
                        className="underline hover:text-black"
                      >
                        {t("export.all")}
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("tick");
                          handleDeselectAllDocs();
                        }}
                        className="underline hover:text-black"
                      >
                        {t("export.none")}
                      </button>
                    </div>
                  </div>

                  {showDocPicker && (
                    <div className="max-h-48 overflow-y-auto border border-[#111111] divide-y divide-neutral-200 bg-[#F9F9F7]">
                      {documents.map((doc) => {
                        const isChecked = selectedIds.includes(doc.id);
                        return (
                          <label
                            key={doc.id}
                            className={`flex items-center gap-2.5 p-2 text-xs cursor-pointer hover:bg-neutral-100 transition-colors ${
                              isChecked ? "bg-white font-medium" : "text-neutral-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                triggerHaptic("tick");
                                handleToggleDoc(doc.id);
                              }}
                              className="accent-[#111111]"
                            />
                            <div className="flex-1 truncate">
                              <span className="font-serif">{doc.title}</span>
                              <span className="font-mono text-[10px] uppercase ml-2 text-neutral-500">
                                [{doc.fileType}]
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-neutral-500 shrink-0">
                              {Math.round(doc.progress * 100)}%
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Progress Bar when export is running */}
            {exporting && progress && (
              <div className="border-2 border-[#111111] p-4 bg-white space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold uppercase">
                  <span>
                    {t("export.compiling", { kind: exporting.toUpperCase() })}
                  </span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="w-full bg-[#E5E5E0] h-3 border border-[#111111] overflow-hidden">
                  <div
                    className="bg-[#111111] h-full transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-neutral-600 capitalize">
                  {t("export.currentStage", { stage: progress.stage })}
                </div>
              </div>
            )}

            {/* Format Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* XLSX Option */}
              <div className="border-2 border-[#111111] bg-white p-4 flex flex-col justify-between hover:shadow-[4px_4px_0px_#111111] transition-shadow">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-[#111111] text-white px-1.5 py-0.5">
                      {t("export.excelSheetsBadge")}
                    </span>
                    <FileSpreadsheet className="w-5 h-5 text-[#111111]" />
                  </div>
                  <h3 className="font-serif text-lg font-bold leading-tight pt-1">
                    {t("export.excelLedger")}
                  </h3>
                  <p className="font-serif text-xs text-neutral-600 leading-relaxed">
                    {t("export.excelDesc")}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E5E5E0] mt-4">
                  <button
                    type="button"
                    disabled={exporting !== null || (!exportAll && selectedIds.length === 0)}
                    onClick={() => executeExport("xlsx")}
                    className="w-full py-2.5 px-3 border-2 border-[#111111] bg-[#111111] text-white font-mono text-xs font-bold uppercase tracking-wide hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {exporting === "xlsx" ? "Compiling..." : t("export.exportXlsx")}
                  </button>
                </div>
              </div>

              {/* PDF Option */}
              <div className="border-2 border-[#111111] bg-white p-4 flex flex-col justify-between hover:shadow-[4px_4px_0px_#111111] transition-shadow">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-[#CC0000] text-white px-1.5 py-0.5">
                      {t("export.pdfBadge")}
                    </span>
                    <FileText className="w-5 h-5 text-[#111111]" />
                  </div>
                  <h3 className="font-serif text-lg font-bold leading-tight pt-1">
                    {t("export.printReport")}
                  </h3>
                  <p className="font-serif text-xs text-neutral-600 leading-relaxed">
                    {t("export.pdfDesc")}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E5E5E0] mt-4">
                  <button
                    type="button"
                    disabled={exporting !== null || (!exportAll && selectedIds.length === 0)}
                    onClick={() => executeExport("pdf")}
                    className="w-full py-2.5 px-3 border-2 border-[#111111] bg-white text-[#111111] font-mono text-xs font-bold uppercase tracking-wide hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {exporting === "pdf" ? "Compiling..." : t("export.exportPdf")}
                  </button>
                </div>
              </div>
            </div>

            {/* Confidentiality Notice */}
            <div className="border-t border-[#111111] pt-3 text-[11px] font-mono text-neutral-500 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t("export.storageNotice")}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
