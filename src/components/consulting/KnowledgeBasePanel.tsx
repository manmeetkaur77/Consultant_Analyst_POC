import { useMemo } from "react";
import {
  FileText,
  Building,
  Ticket,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Check,
  ArrowRight,
} from "lucide-react";
import type { KBDocType, KBResult } from "@/services/consultingAgentApi";

interface KnowledgeBasePanelProps {
  results: KBResult[];
  query?: string | null;
  isLoading?: boolean;
  onConsume: (result: KBResult) => void;
  onConsumeTopN?: (n: number) => void;
  sheetNum?: string;
  /** When true, skip the joseph-sheet wrapper + title row. The caller is
   * providing its own (collapsible) header. */
  headless?: boolean;
}

const TYPE_META: Record<KBDocType, { label: string; Icon: typeof FileText }> = {
  vendor: { label: "Vendor", Icon: FileText },
  internal: { label: "Internal", Icon: Building },
  ticket: { label: "Ticket", Icon: Ticket },
  lessons: { label: "Lessons", Icon: AlertTriangle },
  benchmark: { label: "Benchmark", Icon: BarChart3 },
  other: { label: "Doc", Icon: FileText },
};

const DIM_THRESHOLD = 0.18;

export const KnowledgeBasePanel = ({
  results,
  query,
  isLoading = false,
  onConsume,
  onConsumeTopN,
  sheetNum = "02",
  headless = false,
}: KnowledgeBasePanelProps) => {
  const consumedCount = useMemo(
    () => results.filter((r) => r.consumed).length,
    [results],
  );

  if (!isLoading && results.length === 0) {
    return null;
  }

  const Body = (
    <>
      {query && (
        <div className="joseph-kb-query">
          <span className="joseph-kb-query__label">SEARCH</span>
          <span className="joseph-kb-query__text">{query}</span>
        </div>
      )}

      {isLoading && (
        <div className="joseph-kb-loading">
          <span className="ci-scan" aria-hidden>
            <i /><i /><i /><i /><i />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            searching…
          </span>
        </div>
      )}

      {!isLoading && onConsumeTopN && results.some((r) => !r.consumed) && (
        <button
          type="button"
          className="joseph-kb-bulk"
          onClick={() => onConsumeTopN(3)}
        >
          <ArrowRight className="w-3 h-3" />
          Consume top 3
        </button>
      )}

      <div className="joseph-kb-list">
        {results.map((r, idx) => {
          const meta = TYPE_META[r.type] || TYPE_META.other;
          const TypeIcon = meta.Icon;
          const isDim = r.relevance < DIM_THRESHOLD && !r.consumed;
          const relPct = Math.max(6, Math.round(r.relevance * 100));
          return (
            <div
              key={r.id}
              className={[
                "joseph-kb-card",
                r.consumed ? "joseph-kb-card--consumed" : "",
                isDim ? "joseph-kb-card--dim" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  "--joseph-kb-relevance": `${relPct}%`,
                } as React.CSSProperties
              }
            >
              <div className="joseph-kb-card__rel" aria-hidden />

              <div className="joseph-kb-card__header">
                <span className="joseph-kb-card__idx">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="joseph-kb-card__title" title={r.title}>
                  {r.title}
                </span>
              </div>

              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="joseph-kb-card__url"
                title={r.url}
              >
                <span className="joseph-kb-card__url-text">{r.url}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60 flex-shrink-0" />
              </a>

              <div className="joseph-kb-card__snippet" title={r.snippet}>
                {r.snippet}
              </div>

              <div className="joseph-kb-card__foot">
                {r.consumed ? (
                  <span className="joseph-kb-card__consumed">
                    <Check className="w-3 h-3" />
                    Consumed
                  </span>
                ) : (
                  <button
                    type="button"
                    className="joseph-kb-card__btn"
                    onClick={() => onConsume(r)}
                  >
                    Consume
                  </button>
                )}
                <span className="joseph-kb-card__type">
                  <TypeIcon className="w-3 h-3" />
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  if (headless) return Body;

  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Knowledge base hits</span>
        <span className="ml-auto text-[9px] font-mono tabular-nums tracking-[0.18em] uppercase text-muted-foreground">
          {consumedCount}/{results.length}
        </span>
      </div>
      {Body}
    </section>
  );
};
