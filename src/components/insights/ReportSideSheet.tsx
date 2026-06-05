import { useEffect, useMemo } from "react";
import {
  X,
  FileText,
  FileType,
  ArrowRight,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  exportReport,
  type InsightAssessment,
  type SubScoreKey,
} from "@/services/consultingAgentApi";
import { QuadrantChip } from "./QuadrantChip";

interface ReportSideSheetProps {
  assessment: InsightAssessment | null;
  onClose: () => void;
}

const SUB_SCORE_LABELS: { key: SubScoreKey; label: string; group: "impact" | "speed" }[] = [
  { key: "financial",     label: "Financial impact",    group: "impact" },
  { key: "productivity",  label: "Productivity scale",  group: "impact" },
  { key: "intent",        label: "Business intent",     group: "impact" },
  { key: "complexity",    label: "Implementation",      group: "speed" },
  { key: "data_platform", label: "Data & platform",     group: "speed" },
  { key: "measurement",   label: "Measurement",         group: "speed" },
];

// Minimal markdown renderer — headings, lists, tables, bold, code.
// Same parsing approach used in ConsultingAgent for chat bubbles. Inlined
// here so the side sheet stays self-contained.
const renderInline = (text: string, keyPrefix: string) => {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let i = 0;
  const pattern =
    /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s)]+)/;
  while (remaining.length) {
    const m = remaining.match(pattern);
    if (!m || m.index === undefined) {
      parts.push(remaining);
      break;
    }
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    if (m[1]) parts.push(<strong key={`${keyPrefix}-b-${i}`}>{m[2]}</strong>);
    else if (m[3])
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="font-mono text-[12px] bg-primary/[0.07] text-primary px-1 rounded"
        >
          {m[4]}
        </code>,
      );
    else if (m[5])
      parts.push(
        <a
          key={`${keyPrefix}-l-${i}`}
          href={m[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-0.5"
        >
          {m[6]}
          <ExternalLink className="w-2.5 h-2.5" />
        </a>,
      );
    else if (m[8])
      parts.push(
        <a
          key={`${keyPrefix}-u-${i}`}
          href={m[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {m[8]}
        </a>,
      );
    remaining = remaining.slice(m.index + m[0].length);
    i += 1;
  }
  return parts;
};

const renderMarkdown = (md: string) => {
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let buffer: string[] = [];
  let listBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flushParagraph = () => {
    if (buffer.length) {
      out.push(
        <p key={`p-${key++}`} className="mb-3 last:mb-0 leading-relaxed text-[13.5px]">
          {renderInline(buffer.join(" "), `p${key}`)}
        </p>,
      );
      buffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length) {
      out.push(
        <ul
          key={`ul-${key++}`}
          className="list-disc list-outside pl-5 mb-3 space-y-1 text-[13.5px]"
        >
          {listBuffer.map((item, ix) => (
            <li key={ix}>{renderInline(item, `li-${key}-${ix}`)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };
  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer
      .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((r) => r.length > 0);
    if (rows.length < 2) {
      tableBuffer = [];
      return;
    }
    const [header, _divider, ...body] = rows;
    out.push(
      <div key={`tbl-${key++}`} className="insights-report__table-wrap">
        <table className="insights-report__table">
          <thead>
            <tr>
              {header.map((h, hi) => (
                <th key={hi}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{renderInline(c, `td-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableBuffer = [];
  };

  for (const line of lines) {
    const t = line;
    if (t.startsWith("|") && t.endsWith("|")) {
      if (!inTable) {
        flushParagraph();
        flushList();
        inTable = true;
      }
      tableBuffer.push(t);
      continue;
    } else if (inTable) {
      flushTable();
      inTable = false;
    }

    const stripped = t.trim();
    if (!stripped) {
      flushParagraph();
      flushList();
      continue;
    }
    if (stripped.startsWith("# ")) {
      flushParagraph();
      flushList();
      out.push(
        <h2
          key={`h-${key++}`}
          className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-primary mt-5 mb-2"
        >
          {stripped.slice(2)}
        </h2>,
      );
      continue;
    }
    if (stripped.startsWith("## ")) {
      flushParagraph();
      flushList();
      out.push(
        <h3
          key={`h2-${key++}`}
          className="font-mono text-[10.5px] font-bold tracking-[0.22em] uppercase text-foreground/80 mt-4 mb-2 insights-report__h3"
        >
          {stripped.slice(3)}
        </h3>,
      );
      continue;
    }
    if (stripped.startsWith("### ")) {
      flushParagraph();
      flushList();
      out.push(
        <h4
          key={`h3-${key++}`}
          className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground mt-3 mb-1"
        >
          {stripped.slice(4)}
        </h4>,
      );
      continue;
    }
    if (stripped.startsWith("- ") || stripped.startsWith("* ")) {
      flushParagraph();
      listBuffer.push(stripped.slice(2));
      continue;
    }
    if (stripped === "---") {
      flushParagraph();
      flushList();
      out.push(<hr key={`hr-${key++}`} className="insights-report__rule" />);
      continue;
    }
    flushList();
    buffer.push(stripped);
  }
  flushParagraph();
  flushList();
  flushTable();
  return out;
};

export const ReportSideSheet = ({ assessment, onClose }: ReportSideSheetProps) => {
  const open = assessment !== null;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const rendered = useMemo(
    () => (assessment?.report_markdown ? renderMarkdown(assessment.report_markdown) : []),
    [assessment?.report_markdown],
  );

  const handleExport = async (format: "pdf" | "docx") => {
    if (!assessment?.report_markdown) {
      toast.error("No report content for this assessment.");
      return;
    }
    try {
      const { blob, downloadFilename } = await exportReport(
        assessment.report_markdown,
        format,
        assessment.title?.toLowerCase().replace(/\s+/g, "-"),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  return (
    <>
      {open && (
        <div className="insights-sheet__scrim" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`insights-sheet ${open ? "insights-sheet--open" : ""}`}
        aria-hidden={!open}
      >
        {assessment && (
          <>
            <div className="insights-sheet__topbar">
              <span className="insights-sheet__topbar-eyebrow">
                <span className="insights-sheet__topbar-dot" />
                Assessment report
              </span>
              <button
                type="button"
                className="insights-sheet__close"
                onClick={onClose}
                aria-label="Close report"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="insights-sheet__hero">
              <div className="insights-sheet__hero-meta">
                <QuadrantChip quadrant={assessment.quadrant} size="md" />
                {assessment.is_fresh && (
                  <span className="insights-sheet__fresh-chip">Just added</span>
                )}
              </div>
              <h1 className="insights-sheet__title">{assessment.title}</h1>
              <div className="insights-sheet__hero-line">
                <span className="insights-sheet__hero-meta-row">
                  <User className="w-3 h-3 opacity-70" />
                  {assessment.sponsor}
                </span>
                {assessment.assessed_at && (
                  <span className="insights-sheet__hero-meta-row">
                    <Calendar className="w-3 h-3 opacity-70" />
                    {assessment.assessed_at.slice(0, 10)}
                  </span>
                )}
              </div>
              <div className="insights-sheet__hero-rule" />
            </div>

            <div className="insights-sheet__scroll">
              {/* Scoring breakdown */}
              <section className="insights-sheet__section">
                <div className="insights-sheet__section-title">
                  <span className="insights-sheet__section-num">01</span>
                  Scoring breakdown
                </div>
                <div className="insights-sheet__axis-grid">
                  <div className="insights-sheet__axis">
                    <div className="insights-sheet__axis-label">Impact</div>
                    <div className="insights-sheet__axis-value">
                      {assessment.axes.impact.toFixed(2)}
                    </div>
                  </div>
                  <div className="insights-sheet__axis">
                    <div className="insights-sheet__axis-label">Speed</div>
                    <div className="insights-sheet__axis-value">
                      {assessment.axes.speed.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="insights-sheet__bars">
                  {SUB_SCORE_LABELS.map(({ key, label }) => {
                    const raw = assessment.sub_scores?.[key] ?? 0;
                    const pct = (raw / 5) * 100;
                    return (
                      <div className="insights-sheet__bar" key={key}>
                        <span className="insights-sheet__bar-label">{label}</span>
                        <span className="insights-sheet__bar-track">
                          <span
                            className="insights-sheet__bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="insights-sheet__bar-val">
                          {raw.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Full report */}
              <section className="insights-sheet__section">
                <div className="insights-sheet__section-title">
                  <span className="insights-sheet__section-num">02</span>
                  Full report
                </div>
                {assessment.report_markdown ? (
                  <div className="insights-report">{rendered}</div>
                ) : (
                  <div className="insights-report insights-report--empty">
                    No structured report yet for this assessment.
                  </div>
                )}
              </section>
            </div>

            <div className="insights-sheet__actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("pdf")}
                disabled={!assessment.report_markdown}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("docx")}
                disabled={!assessment.report_markdown}
              >
                <FileType className="w-3.5 h-3.5 mr-1.5" />
                DOCX
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                disabled
                title="Velox handoff is available for the current session's assessment"
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                Velox handoff
              </Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
};
