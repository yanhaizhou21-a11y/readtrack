import React, { useEffect, useState, useRef, useCallback } from "react";
import { pdfjsLib } from "@/lib/pdf/pdfWorker";
import { getDocumentBytes, saveDocumentThumbnail } from "@/features/library/api/documents";
import { ZoomIn, ZoomOut, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { LoadingSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import { reading_update_progress } from "@/features/reader/api";
import { LogicalPosition } from "@/types";

interface PdfViewerProps {
  documentId: string;
  documentTitle: string;
  initialProgress?: number;
  onProgressUpdate?: (progress: number) => void;
}

interface PageRenderState {
  pageNumber: number;
  rendered: boolean;
  rendering: boolean;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  documentId,
  documentTitle,
  initialProgress = 0,
  onProgressUpdate,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [, setPageStates] = useState<PageRenderState[]>([]);
  const [thumbnailGenerated, setThumbnailGenerated] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastReportedPageRef = useRef<number>(1);
  const lastReportTimeRef = useRef<number>(0);

  // 1. Load PDF bytes and document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const bytes = await getDocumentBytes(documentId);
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({
          data: bytes,
          cMapUrl: "https://unpkg.com/pdfjs-dist@3.11.174/cmaps/",
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);

        const states: PageRenderState[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          states.push({ pageNumber: i, rendered: false, rendering: false });
        }
        setPageStates(states);

        // Calculate initial page based on initial progress
        if (initialProgress > 0 && doc.numPages > 1) {
          const targetPage = Math.min(
            doc.numPages,
            Math.max(1, Math.round(initialProgress * doc.numPages))
          );
          setCurrentPage(targetPage);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("Failed to load PDF:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Gagal memuat dokumen PDF. Format mungkin rusak atau terproteksi kata sandi."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [documentId, initialProgress]);

  // 2. Generate cover thumbnail from Page 1
  const generateThumbnail = useCallback(
    async (doc: pdfjsLib.PDFDocumentProxy) => {
      if (thumbnailGenerated) return;
      try {
        const page1 = await doc.getPage(1);
        const viewport = page1.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = Math.min(300, viewport.width);
        canvas.height = (viewport.height / viewport.width) * canvas.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: page1.getViewport({
            scale: canvas.width / page1.getViewport({ scale: 1 }).width,
          }),
        };

        await page1.render(renderContext).promise;
        const dataUrl = canvas.toDataURL("image/webp", 0.85);

        await saveDocumentThumbnail(documentId, dataUrl).catch(console.error);
        setThumbnailGenerated(true);
      } catch (e) {
        console.warn("Could not generate thumbnail for PDF:", e);
      }
    },
    [documentId, thumbnailGenerated]
  );

  useEffect(() => {
    if (pdfDoc && !thumbnailGenerated) {
      generateThumbnail(pdfDoc);
    }
  }, [pdfDoc, thumbnailGenerated, generateThumbnail]);

  // 3. Render page onto canvas
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return;
      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const containerWidth =
          containerRef.current?.clientWidth || window.innerWidth || 360;
        // Available width with padding (subtract 32px for margins)
        const targetWidth = Math.max(280, (containerWidth - 32) * scale);

        const unscaledViewport = page.getViewport({ scale: 1 });
        const pageScale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: pageScale });

        // High DPI rendering for sharp text
        const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        await page.render(renderContext).promise;

        setPageStates((prev) =>
          prev.map((p) =>
            p.pageNumber === pageNumber
              ? { ...p, rendered: true, rendering: false }
              : p
          )
        );
      } catch (err) {
        console.error(`Error rendering page ${pageNumber}:`, err);
      }
    },
    [pdfDoc, scale]
  );

  // 4. Setup Intersection Observer for lazy rendering & page tracking
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute("data-page-number"));
          if (!pageNum) return;

          if (entry.isIntersecting) {
            setCurrentPage(pageNum);

            // Lazy render this page and surrounding pages
            renderPage(pageNum);
            if (pageNum > 1) renderPage(pageNum - 1);
            if (pageNum < numPages) renderPage(pageNum + 1);

            // Report progress throttled
            const now = Date.now();
            if (
              pageNum !== lastReportedPageRef.current &&
              now - lastReportTimeRef.current > 1000
            ) {
              lastReportedPageRef.current = pageNum;
              lastReportTimeRef.current = now;

              const progress = Math.min(1, pageNum / numPages);
              if (onProgressUpdate) onProgressUpdate(progress);

              const logicalPos: LogicalPosition = {
                documentId,
                page: pageNum,
                percentage: progress,
                parserVersion: 1,
              };

              reading_update_progress(documentId, logicalPos).catch(() => {});
            }
          }
        });
      },
      {
        root: containerRef.current,
        rootMargin: "300px 0px",
        threshold: 0.1,
      }
    );

    observerRef.current = observer;

    canvasRefs.current.forEach((canvas) => {
      observer.observe(canvas.parentElement || canvas);
    });

    return () => {
      observer.disconnect();
    };
  }, [pdfDoc, numPages, renderPage, documentId, onProgressUpdate]);

  // Scroll to initial page when loaded
  useEffect(() => {
    if (!loading && numPages > 0 && initialProgress > 0) {
      const targetPage = Math.min(
        numPages,
        Math.max(1, Math.round(initialProgress * numPages))
      );
      const targetEl = canvasRefs.current.get(targetPage);
      if (targetEl) {
        setTimeout(() => {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
    }
  }, [loading, numPages, initialProgress]);

  // Zoom handlers
  const handleZoomIn = () => setScale((s) => Math.min(2.5, s + 0.2));
  const handleZoomOut = () => setScale((s) => Math.max(0.6, s - 0.2));
  const handleZoomReset = () => setScale(1.0);

  const scrollToPage = (pageNum: number) => {
    const el = canvasRefs.current.get(pageNum);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
        <LoadingSkeleton className="h-8 w-48 rounded-md" />
        <LoadingSkeleton className="h-96 w-full max-w-sm rounded-lg" />
        <p className="font-serif text-xs text-muted">Memuat halaman dokumen PDF...</p>
      </div>
    );
  }

  if (error || !pdfDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <ErrorState
          title="Gagal Membuka PDF"
          message={error || "Format PDF tidak dapat dirender secara visual."}
        />
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col h-full bg-neutral-900/10 dark:bg-neutral-950/40 select-none overflow-hidden">
      {/* Floating Header / Document Title */}
      {documentTitle && (
        <div className="absolute top-3 left-3 z-30 max-w-[45%] truncate bg-background/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-full shadow-lg text-xs font-serif font-medium text-foreground pointer-events-none">
          {documentTitle}
        </div>
      )}

      {/* Floating Zoom / Page Control Toolbar */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-background/90 backdrop-blur-md border border-border px-2.5 py-1.5 rounded-full shadow-lg">
        <button
          type="button"
          onClick={handleZoomOut}
          title="Perkecil"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800 text-foreground transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] font-bold text-foreground px-1 min-w-[36px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          title="Perbesar"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800 text-foreground transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        {scale !== 1.0 && (
          <button
            type="button"
            onClick={handleZoomReset}
            title="Reset Zoom"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-neutral-200/50 dark:hover:bg-neutral-800 text-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Main Continuous Document View */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-auto py-6 px-3 flex flex-col items-center gap-6 scroll-smooth"
        data-testid="pdf-viewer-container"
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            data-page-number={pageNum}
            className="relative flex flex-col items-center bg-white dark:bg-neutral-900 rounded-sm shadow-md transition-shadow hover:shadow-xl"
            style={{
              minHeight: `${Math.round(400 * scale)}px`,
              minWidth: `${Math.round(280 * scale)}px`,
            }}
          >
            {/* Header label for page */}
            <div className="absolute -top-5 left-1 font-mono text-[10px] text-muted uppercase tracking-wider select-none">
              Halaman {pageNum}
            </div>

            {/* Canvas for page */}
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
                else canvasRefs.current.delete(pageNum);
              }}
              className="block rounded-sm"
            />
          </div>
        ))}
      </div>

      {/* Floating Bottom Page Indicator Badge */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-foreground/90 text-background px-3 py-1.5 rounded-full shadow-lg text-xs font-mono font-bold tracking-wide">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => scrollToPage(currentPage - 1)}
          className="disabled:opacity-30 hover:opacity-80 p-0.5"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <span>
          {currentPage} / {numPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= numPages}
          onClick={() => scrollToPage(currentPage + 1)}
          className="disabled:opacity-30 hover:opacity-80 p-0.5"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
