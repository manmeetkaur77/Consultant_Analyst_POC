import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Paperclip,
  Send,
  FileText,
  FileType,
  ArrowRight,
  Loader2,
  ExternalLink,
  Library,
  Search,
  Check,
  BarChart3,
  Quote,
  FileOutput,
  ChevronDown,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MainLayout } from "@/components/layout/MainLayout";
import { toast } from "sonner";
import { ScoringPanel } from "@/components/consulting/ScoringPanel";
import { CoverageIndicator } from "@/components/consulting/CoverageIndicator";
import { CitationBadge } from "@/components/consulting/CitationBadge";
import { VeloxHandoffModal } from "@/components/consulting/VeloxHandoffModal";
import { KnowledgeBasePanel } from "@/components/consulting/KnowledgeBasePanel";
import {
  buildVeloxHandoffPayload,
  exportReport,
  rescoreRationale,
  saveToInsights,
  streamConsultingMessage,
  uploadDocument,
  type CitationPayload,
  type CoveragePayload,
  type CoverageArea,
  type KBResult,
  type ScoresPayload,
  type SubScoreKey,
} from "@/services/consultingAgentApi";

// Per-turn "what happened" — surfaces invisible side-effects (a score
// firmed up, a coverage area lit, a citation got added) as compact chips
// below the bot message, so the user can see the agent's work.
type TurnActivity = {
  scoreUpdates?: {
    key: SubScoreKey;
    label: string;
    from: number | null;
    to: number | null;
    confidence: "low" | "medium" | "high" | null;
  }[];
  coverageTouches?: { area: CoverageArea; label: string; note: string }[];
  newCitations?: { publisher: string; tier: CitationPayload["tier"] }[];
  kbConsumed?: number;
  kbResultsCount?: number;
  reportDelivered?: boolean;
  quadrant?: string | null;
};

type ChatTurn = {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: string;
  isLoading?: boolean;
  activity?: TurnActivity;
};

const OPENING_LINE =
  "Tell me about the use case you're thinking through — what's the problem you're trying to solve, or what made you start looking at this?\n\nIf you have any context you'd like me to read before we dig in — a doc, a Confluence page, a vendor proposal — drop it in. Totally optional.";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const nowStamp = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Lightweight markdown→JSX for chat bubbles. Handles headings, lists, bold,
// inline code, links — enough to render Joseph's prose without dragging in a
// full markdown lib.
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
    if (m[1])
      parts.push(<strong key={`${keyPrefix}-b-${i}`}>{m[2]}</strong>);
    else if (m[3])
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="font-mono text-[12.5px] bg-primary/[0.07] text-primary px-1 rounded"
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

const renderMarkdownBlock = (text: string) => {
  const lines = text.split("\n");
  const out: JSX.Element[] = [];
  let buffer: string[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (buffer.length) {
      out.push(
        <p key={`p-${key++}`} className="mb-2 last:mb-0">
          {renderInline(buffer.join(" "), `p${key}`)}
        </p>,
      );
      buffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length) {
      out.push(
        <ul key={`ul-${key++}`} className="list-disc list-outside pl-5 mb-2 space-y-1">
          {listBuffer.map((item, ix) => (
            <li key={ix}>{renderInline(item, `li-${key}-${ix}`)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushParagraph();
      flushList();
      continue;
    }
    if (t.startsWith("# ")) {
      flushParagraph();
      flushList();
      out.push(
        <h2
          key={`h-${key++}`}
          className="font-mono text-[11px] font-bold tracking-[0.18em] uppercase text-primary mt-3 mb-1.5"
        >
          {t.slice(2)}
        </h2>,
      );
      continue;
    }
    if (t.startsWith("## ")) {
      flushParagraph();
      flushList();
      out.push(
        <h3
          key={`h2-${key++}`}
          className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-foreground/85 mt-2.5 mb-1"
        >
          {t.slice(3)}
        </h3>,
      );
      continue;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      flushParagraph();
      listBuffer.push(t.slice(2));
      continue;
    }
    flushList();
    buffer.push(t);
  }
  flushParagraph();
  flushList();
  return out;
};

/**
 * What Joseph will build on the right as the conversation progresses.
 * Rendered inline in the chat area on the empty state so the page doesn't
 * feel barren before the user types anything. Each card previews one of
 * the five sub-panels that materialize over the course of the assessment.
 */
const INTRO_HINTS = [
  {
    icon: Search,
    label: "Knowledge base",
    hint: "I'll surface relevant internal docs the moment you describe the use case.",
    when: "On your first message",
  },
  {
    icon: Check,
    label: "Discovery coverage",
    hint: "I track five areas — qualification, value, viability, drivers, instinct.",
    when: "As we explore each",
  },
  {
    icon: BarChart3,
    label: "Scoring ledger",
    hint: "Six sub-scores on a 2×2 matrix. Confidence builds with the conversation.",
    when: "Once I have a hypothesis",
  },
  {
    icon: Quote,
    label: "Sources cited",
    hint: "Every benchmark gets a publisher tag — Primary, Secondary, Directional.",
    when: "When I reference a number",
  },
  {
    icon: FileOutput,
    label: "Deliverable",
    hint: "Exportable PDF + DOCX + handoff JSON for the next agent.",
    when: "When we're ready to land",
  },
] as const;

/**
 * Quick-start sample use cases. Clicking one fills the composer with a
 * realistic first-message draft. Lowers the cold-start friction — based
 * on the empty-state UX pattern "give them an example to act on, not just
 * a blank input."
 */
const SAMPLE_PROMPTS: { headline: string; preview: string; prompt: string }[] = [
  {
    headline: "Email drafting assistant",
    preview: "AI drafts first-pass support email responses",
    prompt:
      "We're looking at deploying an AI assistant to draft first-pass responses for our customer support team. Agents would review and send. The pitch is it saves drafting time and frees up agent capacity.",
  },
  {
    headline: "KYC document extraction",
    preview: "Cut onboarding cycle 9 days → 3",
    prompt:
      "We want to automate KYC document extraction for our onboarding analysts — passports, utility bills, corporate ownership docs. Goal is to cut the analyst time per case by 40-50% and shorten the onboarding cycle.",
  },
  {
    headline: "Fraud explanation generation",
    preview: "SR 11-7 compliant decline letters",
    prompt:
      "We're evaluating using an LLM to generate SR 11-7 compliant explanations for declined transactions. Should reduce customer-service callback volume and strengthen our model governance posture.",
  },
  {
    headline: "Code review co-pilot rollout",
    preview: "GitHub Copilot Enterprise for 1,200 engineers",
    prompt:
      "Looking at rolling out GitHub Copilot Enterprise across our 1,200 engineers. Vendor SaaS, minimal integration, but I want to pressure-test the productivity numbers before signing.",
  },
];

interface SuggestedPromptsProps {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

const SuggestedPrompts = ({ onPick, disabled }: SuggestedPromptsProps) => (
  <div className="joseph-suggest">
    <div className="joseph-suggest__eyebrow">
      <span className="joseph-suggest__eyebrow-line" />
      <span>Or start from a sample</span>
    </div>
    <div className="joseph-suggest__grid">
      {SAMPLE_PROMPTS.map((s, idx) => (
        <button
          key={s.headline}
          type="button"
          className="joseph-suggest__chip"
          disabled={disabled}
          onClick={() => onPick(s.prompt)}
          style={{ animationDelay: `${0.18 + idx * 0.04}s` }}
        >
          <span className="joseph-suggest__chip-headline">{s.headline}</span>
          <span className="joseph-suggest__chip-preview">{s.preview}</span>
          <span className="joseph-suggest__chip-arrow" aria-hidden>→</span>
        </button>
      ))}
    </div>
  </div>
);

const IntroHints = () => (
  <div className="joseph-intro">
    <div className="joseph-intro__eyebrow">
      <span className="joseph-intro__eyebrow-dot" aria-hidden />
      As we talk, here's what I'll build alongside the chat
    </div>
    <div className="joseph-intro__grid">
      {INTRO_HINTS.map((h, idx) => (
        <div
          key={h.label}
          className="joseph-intro__card"
          style={{ animationDelay: `${0.1 + idx * 0.06}s` }}
        >
          <div className="joseph-intro__card-head">
            <span className="joseph-intro__icon">
              <h.icon className="w-3.5 h-3.5" />
            </span>
            <span className="joseph-intro__num">{String(idx + 1).padStart(2, "0")}</span>
          </div>
          <div className="joseph-intro__label">{h.label}</div>
          <p className="joseph-intro__hint">{h.hint}</p>
          <div className="joseph-intro__when">{h.when}</div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Accordion-style wrapper for a side-panel section. Always shows its
 * header so the user can see every area at a glance; clicking the
 * header toggles the body. New sections auto-expand on arrival.
 */
type SectionAccent = "kb" | "coverage" | "scores" | "citations" | "report";

interface CollapsibleSectionProps {
  num: string;
  title: string;
  badge?: string | number | null;
  expanded: boolean;
  onToggle: () => void;
  accent: SectionAccent;
  children: React.ReactNode;
}

const CollapsibleSection = ({
  num,
  title,
  badge,
  expanded,
  onToggle,
  accent,
  children,
}: CollapsibleSectionProps) => (
  <section
    data-accent={accent}
    className={`joseph-sheet joseph-collapsible ${expanded ? "joseph-collapsible--open" : ""}`}
  >
    <button
      type="button"
      className="joseph-collapsible__head"
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <span className="joseph-sheet__num">{num}</span>
      <span className="joseph-collapsible__title">{title}</span>
      {badge !== undefined && badge !== null && badge !== "" && (
        <span className="joseph-collapsible__badge">{badge}</span>
      )}
      <ChevronDown
        className={`joseph-collapsible__chev ${expanded ? "" : "joseph-collapsible__chev--closed"}`}
        aria-hidden
      />
    </button>
    <div className="joseph-collapsible__body" aria-hidden={!expanded}>
      <div className="joseph-collapsible__body-inner">{children}</div>
    </div>
  </section>
);

const SUBSCORE_LABEL: Record<SubScoreKey, string> = {
  financial: "Financial impact",
  productivity: "Productivity scale",
  intent: "Business intent",
  complexity: "Implementation",
  data_platform: "Data & platform",
  measurement: "Measurement",
};

const QUADRANT_LABEL: Record<string, string> = {
  "Transformational Value": "Transformational",
  "Accelerator": "Transformational",
  "Quick Win": "Accelerators",
  "Incremental Growth": "Quick Wins",
  "Defer": "Incremental Growth",
};

const COVERAGE_LABEL: Record<CoverageArea, string> = {
  qualification: "Qualification",
  value: "Value",
  viability: "Viability",
  drivers: "Drivers",
  instinct: "Instinct",
};

const CONF_GLYPH: Record<"low" | "medium" | "high", string> = {
  low: "L",
  medium: "M",
  high: "H",
};

/**
 * Compact "what just happened" strip rendered under a bot message.
 * Each chip surfaces one observable side-effect of the agent's turn —
 * a score updated, a coverage area touched, a citation added, the
 * report delivered. Helps the user see the work the agent did beyond
 * the prose reply.
 */
const ActivityStrip = ({ activity }: { activity: TurnActivity }) => {
  const chips: JSX.Element[] = [];

  activity.scoreUpdates?.forEach((u) => {
    const direction =
      u.from === null && u.to !== null
        ? "set"
        : u.from !== null && u.to !== null && u.to > u.from
          ? "up"
          : u.from !== null && u.to !== null && u.to < u.from
            ? "down"
            : "same";
    const arrow =
      direction === "set"
        ? "·"
        : direction === "up"
          ? "↑"
          : direction === "down"
            ? "↓"
            : "→";
    chips.push(
      <span
        key={`s-${u.key}`}
        className="joseph-activity__chip joseph-activity__chip--score"
        title={`${u.label}: ${u.from ?? "—"} → ${u.to ?? "—"} (${u.confidence ?? "no"} confidence)`}
      >
        <BarChart3 className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">{u.label}</span>
        <span className="joseph-activity__chip-val">
          {u.to !== null ? u.to.toFixed(1) : "—"} {arrow}
        </span>
        {u.confidence && (
          <span
            className={`joseph-activity__conf joseph-activity__conf--${u.confidence}`}
            title={`Confidence: ${u.confidence}`}
          >
            {CONF_GLYPH[u.confidence]}
          </span>
        )}
      </span>,
    );
  });

  activity.coverageTouches?.forEach((c) => {
    chips.push(
      <span
        key={`c-${c.area}`}
        className="joseph-activity__chip joseph-activity__chip--coverage"
        title={c.note || `Touched ${c.label}`}
      >
        <Check className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">Coverage</span>
        <span className="joseph-activity__chip-val">{c.label}</span>
      </span>,
    );
  });

  activity.newCitations?.forEach((cit, idx) => {
    chips.push(
      <span
        key={`cit-${idx}`}
        className={`joseph-activity__chip joseph-activity__chip--cite joseph-activity__chip--tier-${cit.tier}`}
        title={`Cited ${cit.publisher} (${cit.tier})`}
      >
        <Quote className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">Cited</span>
        <span className="joseph-activity__chip-val">{cit.publisher}</span>
      </span>,
    );
  });

  if (activity.kbResultsCount) {
    chips.push(
      <span
        key="kb"
        className="joseph-activity__chip joseph-activity__chip--kb"
        title={`Found ${activity.kbResultsCount} matching documents in the knowledge base`}
      >
        <Search className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">KB search</span>
        <span className="joseph-activity__chip-val">{activity.kbResultsCount} hits</span>
      </span>,
    );
  }

  if (activity.kbConsumed) {
    chips.push(
      <span
        key="kb-consume"
        className="joseph-activity__chip joseph-activity__chip--kb"
        title={`Read ${activity.kbConsumed} knowledge base document(s) in full`}
      >
        <FileText className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">Read</span>
        <span className="joseph-activity__chip-val">
          {activity.kbConsumed} doc{activity.kbConsumed === 1 ? "" : "s"}
        </span>
      </span>,
    );
  }

  if (activity.reportDelivered) {
    chips.push(
      <span
        key="report"
        className="joseph-activity__chip joseph-activity__chip--report"
        title="Feasibility report delivered"
      >
        <FileOutput className="w-2.5 h-2.5" />
        <span className="joseph-activity__chip-label">Report</span>
        <span className="joseph-activity__chip-val">
          {activity.quadrant || "Delivered"}
        </span>
      </span>,
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="joseph-activity">
      <span className="joseph-activity__eyebrow">↳ what changed</span>
      <div className="joseph-activity__chips">{chips}</div>
    </div>
  );
};

const Transcript = ({
  turns,
  isStreaming,
}: {
  turns: ChatTurn[];
  isStreaming: boolean;
}) => (
  <div className="joseph-transcript">
    {turns.map((t, idx) => {
      const isBot = t.role === "bot";
      const isLast = idx === turns.length - 1;
      const showCursor = isBot && isLast && isStreaming && !t.isLoading;
      return (
        <div
          key={t.id}
          className={`joseph-turn ${isBot ? "joseph-turn--bot" : "joseph-turn--user"}`}
        >
          <div className="joseph-turn__meta">
            <span className="joseph-turn__meta-num">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span className="joseph-turn__role">
              {isBot ? "Joseph" : "You"}
            </span>
            <span className="joseph-turn__time">{t.timestamp}</span>
          </div>
          <div className="joseph-turn__body">
            {t.isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[13px]">
                <span className="ci-scan" aria-hidden>
                  <i /><i /><i /><i /><i />
                </span>
                <span className="font-mono text-[11px] tracking-[0.18em] uppercase">
                  thinking…
                </span>
              </span>
            ) : (
              <>
                {renderMarkdownBlock(t.content)}
                {showCursor && <span className="joseph-turn__cursor" />}
                {isBot && t.activity && !showCursor && (
                  <ActivityStrip activity={t.activity} />
                )}
              </>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

const ConsultingAgent = () => {
  const navigate = useNavigate();

  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: "opening", role: "bot", content: OPENING_LINE, timestamp: nowStamp() },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  const [scores, setScores] = useState<ScoresPayload | null>(null);
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [citations, setCitations] = useState<CitationPayload[]>([]);
  const [currentReport, setCurrentReport] = useState<string | null>(null);
  const [kbResults, setKbResults] = useState<KBResult[]>([]);
  const [kbQuery, setKbQuery] = useState<string | null>(null);
  const [kbEnabled, setKbEnabled] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<
    { fileId: string; filename: string }[]
  >([]);

  const [veloxOpen, setVeloxOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [isSavingInsights, setIsSavingInsights] = useState(false);
  const [savedToInsights, setSavedToInsights] = useState(false);

  // Accordion state for the side-panel sections. When a *new* section
  // arrives we collapse every other one and spotlight just the new one
  // so the user doesn't have to scroll to see it. Manual clicks via
  // `toggleSection` still allow expanding multiple sections at once.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const toggleSection = (key: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const focusSection = (key: string) => {
    setExpandedSections(new Set([key]));
    setFocusKey(key);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Refs to each collapsible section so we can scroll the spotlighted
  // one into view after a focusSection() call.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const ensureClientSessionId = () => {
    if (sessionId) return sessionId;
    const next = `client-${newId()}`;
    setSessionId(next);
    return next;
  };

  const handleReset = () => {
    setTurns([
      { id: "opening-reset", role: "bot", content: OPENING_LINE, timestamp: nowStamp() },
    ]);
    setSessionId(null);
    setPendingReset(true);
    setScores(null);
    setCoverage(null);
    setCitations([]);
    setCurrentReport(null);
    setKbResults([]);
    setKbQuery(null);
    setUploadedFiles([]);
    setSavedToInsights(false);
    setIsSavingInsights(false);
    toast.success("New assessment started.");
  };

  const handleSend = async (overrideMessage?: string) => {
    const text = (overrideMessage ?? inputValue).trim();
    if (!text || isStreaming) return;

    const userTurn: ChatTurn = {
      id: newId(),
      role: "user",
      content: text,
      timestamp: nowStamp(),
    };
    const botId = newId();
    const botTurn: ChatTurn = {
      id: botId,
      role: "bot",
      content: "",
      timestamp: nowStamp(),
      isLoading: true,
    };
    setTurns((prev) => [...prev, userTurn, botTurn]);
    setInputValue("");
    setIsStreaming(true);

    // Capture the very first user message as the KB search query (server
    // auto-runs the search on the first turn — we mirror what it queried
    // for in the panel label).
    if (kbQuery === null) {
      setKbQuery(text);
    }

    const sidForRequest = sessionId;
    const resetForRequest = pendingReset;

    // Per-turn snapshot — diff incoming state events against these to
    // figure out what *changed* this turn (a sub-score firmed up, a new
    // coverage area lit, a citation got added). Surfaced under the bot
    // message via ActivityStrip so the user can see the agent's work.
    const prevScoresSnap = scores;
    const prevCoverageSnap = coverage;
    const prevCitationCount = citations.length;
    const prevKbConsumedIds = new Set(
      kbResults.filter((r) => r.consumed).map((r) => r.id),
    );
    const prevReportPresent = currentReport !== null;
    const turnActivity: TurnActivity = {};
    const mergeActivity = (patch: Partial<TurnActivity>) => {
      Object.assign(turnActivity, patch);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === botId ? { ...t, activity: { ...turnActivity } } : t,
        ),
      );
    };

    try {
      let accumulated = "";
      for await (const event of streamConsultingMessage(
        text,
        sidForRequest,
        resetForRequest,
        !kbEnabled,
      )) {
        if (event.type === "metadata") {
          setSessionId(event.session_id);
          setPendingReset(false);
        } else if (event.type === "chunk") {
          accumulated += event.content;
          setTurns((prev) =>
            prev.map((t) =>
              t.id === botId
                ? { ...t, content: accumulated, isLoading: false }
                : t,
            ),
          );
        } else if (event.type === "state") {
          if (event.kind === "scores") {
            const next: ScoresPayload = event.payload;
            const updates: NonNullable<TurnActivity["scoreUpdates"]> = [];
            (Object.keys(next.sub_scores) as SubScoreKey[]).forEach((key) => {
              const prev = prevScoresSnap?.sub_scores[key];
              const cur = next.sub_scores[key];
              const valueChanged = (prev?.value ?? null) !== (cur.value ?? null);
              const confChanged = (prev?.confidence ?? null) !== (cur.confidence ?? null);
              if ((valueChanged || confChanged) && cur.value !== null) {
                updates.push({
                  key,
                  label: SUBSCORE_LABEL[key],
                  from: prev?.value ?? null,
                  to: cur.value,
                  confidence: cur.confidence,
                });
              }
            });
            mergeActivity({
              scoreUpdates: updates.length ? updates : turnActivity.scoreUpdates,
              quadrant: next.quadrant,
            });
            setScores(next);
          } else if (event.kind === "coverage") {
            const next: CoveragePayload = event.payload;
            const touches: NonNullable<TurnActivity["coverageTouches"]> = [];
            (Object.keys(next) as CoverageArea[]).forEach((area) => {
              const wasTouched = prevCoverageSnap?.[area]?.touched ?? false;
              const isTouched = next[area]?.touched ?? false;
              if (!wasTouched && isTouched) {
                touches.push({
                  area,
                  label: COVERAGE_LABEL[area],
                  note: next[area]?.note || "",
                });
              }
            });
            mergeActivity({
              coverageTouches: touches.length
                ? [...(turnActivity.coverageTouches || []), ...touches]
                : turnActivity.coverageTouches,
            });
            setCoverage(next);
          } else if (event.kind === "citations") {
            const next: CitationPayload[] = event.payload;
            const added = next.slice(prevCitationCount);
            mergeActivity({
              newCitations: added.length
                ? added.map((c) => ({
                    publisher: c.publisher || new URL(c.url).hostname,
                    tier: c.tier,
                  }))
                : turnActivity.newCitations,
            });
            setCitations(next);
          } else if (event.kind === "report") {
            setCurrentReport(event.payload);
            if (!prevReportPresent) {
              mergeActivity({
                reportDelivered: true,
                quadrant: turnActivity.quadrant ?? scores?.quadrant ?? null,
              });
            }
          } else if (event.kind === "kb_results") {
            const next: KBResult[] = event.payload.results;
            const newlyConsumed = next.filter(
              (r) => r.consumed && !prevKbConsumedIds.has(r.id),
            ).length;
            mergeActivity({
              kbResultsCount:
                next.length > 0 && prevKbConsumedIds.size === 0 && next.every((r) => !r.consumed)
                  ? next.length
                  : turnActivity.kbResultsCount,
              kbConsumed: newlyConsumed
                ? (turnActivity.kbConsumed || 0) + newlyConsumed
                : turnActivity.kbConsumed,
            });
            setKbResults(next);
          }
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else if (event.type === "done") {
          break;
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === botId
            ? { ...t, content: `_Error: ${errMsg}_`, isLoading: false }
            : t,
        ),
      );
      toast.error(errMsg);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleUpload = async (file: File) => {
    const sid = ensureClientSessionId();
    try {
      toast.loading(`Uploading ${file.name}…`, { id: "upload" });
      const result = await uploadDocument(sid, file);
      toast.success(`Uploaded ${result.filename} (${result.chars} chars)`, {
        id: "upload",
      });
      setUploadedFiles((prev) => [
        ...prev,
        { fileId: result.file_id, filename: result.filename },
      ]);
      const userPrompt = `I've uploaded "${result.filename}" — please take a look and tell me what stands out.`;
      handleSend(userPrompt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", {
        id: "upload",
      });
    }
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  // Sends a "consume X" message so the server-side preprocessor inlines
  // the KB doc's full content and Joseph reads it on the next turn.
  const handleConsumeKb = (result: KBResult) => {
    if (result.consumed || isStreaming) return;
    setKbResults((prev) =>
      prev.map((r) => (r.id === result.id ? { ...r, consumed: true } : r)),
    );
    handleSend(`Consume document ${result.id}: ${result.title}`);
  };

  // "Consume top N" shortcut — clicks all unconsumed top-N in a single
  // message so Joseph reads them together.
  const handleConsumeTopN = (n: number) => {
    if (isStreaming) return;
    const targets = kbResults.filter((r) => !r.consumed).slice(0, n);
    if (targets.length === 0) return;
    setKbResults((prev) =>
      prev.map((r) =>
        targets.some((t) => t.id === r.id) ? { ...r, consumed: true } : r,
      ),
    );
    const refs = targets.map((t) => `${t.id} (${t.title})`).join(", ");
    handleSend(`Consume documents ${refs}`);
  };

  // User edited a sub-score rationale in the scoring panel. Send it to the
  // agent, which re-evaluates that score (and any others the new info bears
  // on) and returns the full updated scores payload — axes and quadrant
  // recompute on the server. Returns the agent's short note for the panel.
  const handleRescore = async (
    key: SubScoreKey,
    rationale: string,
  ): Promise<string | void> => {
    if (!sessionId) {
      toast.error("Start the conversation before editing scores.");
      throw new Error("No active session");
    }
    if (isStreaming) {
      toast.error("Wait for the current reply to finish, then edit the score.");
      throw new Error("Streaming in progress");
    }
    const result = await rescoreRationale({ sessionId, subScore: key, rationale });
    setScores(result.scores);
    toast.success("Re-scored from your edit.");
    return result.message;
  };

  // Stash the current assessment to the org-wide Insights surface, then
  // route the user there with the new case pre-opened in the side sheet.
  const handleSaveToInsights = async () => {
    if (!currentReport || !sessionId) {
      toast.error("Generate the feasibility report before saving.");
      return;
    }
    setIsSavingInsights(true);
    try {
      // Pull a working title out of the report — first H1 if present.
      const titleMatch = currentReport.match(/^#\s+([^\n]+)$/m);
      const titleCandidate = titleMatch
        ? titleMatch[1].replace(/^Use Case Feasibility Report$/i, "")
        : "";
      const summaryMatch = currentReport.match(
        /## Summary\s*\n([^\n]+)/i,
      );
      const inferred = titleCandidate.trim() || summaryMatch?.[1]?.slice(0, 80) || "Current assessment";

      const sponsorMatch = currentReport.match(/Sponsor:\s*([^\n]+)/i);
      const result = await saveToInsights({
        sessionId,
        title: inferred,
        sponsor: sponsorMatch?.[1]?.trim(),
        reportMarkdown: currentReport,
      });
      setSavedToInsights(true);
      toast.success("Saved to Insights — opening the leadership view.");
      // Brief pause so the success toast lands, then navigate
      setTimeout(() => {
        navigate(`/insights?caseId=${encodeURIComponent(result.id)}`);
      }, 450);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSavingInsights(false);
    }
  };

  const handleExport = async (format: "pdf" | "docx") => {
    if (!currentReport) {
      toast.error("No report yet — deliver the report first.");
      return;
    }
    setExporting(format);
    try {
      const { blob, downloadFilename } = await exportReport(currentReport, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const veloxPayload = useMemo(
    () =>
      currentReport
        ? buildVeloxHandoffPayload(currentReport, scores, coverage)
        : null,
    [currentReport, scores, coverage],
  );

  // Progressive disclosure — side panel sections each appear only when they
  // have data, and the panel container only appears when at least one
  // sub-section has content. Until then, the chat owns the full viewport.
  const hasCoverage = useMemo(
    () => coverage !== null && Object.values(coverage).some((c) => c.touched),
    [coverage],
  );
  const hasScores = useMemo(
    () =>
      scores !== null &&
      (scores.axes.impact !== null ||
        scores.axes.speed !== null ||
        Object.values(scores.sub_scores).some((s) => s.value !== null)),
    [scores],
  );
  const hasKb = kbResults.length > 0;
  const hasCitations = citations.length > 0;
  const hasReport = currentReport !== null;
  const hasAnyPanel = hasKb || hasCoverage || hasScores || hasCitations || hasReport;

  // Spotlight each section the first time its data shows up — collapse
  // the others so the new one is unmissable.
  useEffect(() => { if (hasKb) focusSection("kb"); }, [hasKb]);
  useEffect(() => { if (hasCoverage) focusSection("coverage"); }, [hasCoverage]);
  useEffect(() => { if (hasScores) focusSection("scores"); }, [hasScores]);
  useEffect(() => { if (hasCitations) focusSection("citations"); }, [hasCitations]);
  useEffect(() => { if (hasReport) focusSection("report"); }, [hasReport]);

  // After the spotlight switches, scroll the new section into view in the
  // side gallery. Two RAFs so the expand animation has started laying out
  // before we measure.
  useEffect(() => {
    if (!focusKey) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = sectionRefs.current[focusKey];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [focusKey]);

  return (
    <div className="min-h-screen bg-background">
      <MainLayout
        currentView="consulting-agent"
        showBackButton
        onBack={() => navigate("/")}
      >
        {/* DEMO MODE — TopHeader is hidden in MainLayout, so this page
            owns the full viewport height. Restore `h-[calc(100vh-4rem)]`
            here if you re-enable the TopHeader. */}
        <div className="flex flex-col h-screen joseph-page-canvas">

          {/* The chat + composer block is reused in both layouts. We pull
              it out so we don't render the textarea twice (and lose focus
              every time the side panel materializes). */}
          {(() => {
            const ChatBlock = (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto relative"
                  style={{ zIndex: 1 }}
                >
                  <Transcript turns={turns} isStreaming={isStreaming} />

                  {/* Empty state — sample prompts (click-to-send) + ambient
                      preview of what Joseph will build on the right as the
                      conversation progresses. Both disappear after the
                      first user message. */}
                  {!hasAnyPanel && turns.every((t) => t.role !== "user") && (
                    <SuggestedPrompts
                      disabled={isStreaming}
                      onPick={(p) => handleSend(p)}
                    />
                  )}

                  {uploadedFiles.length > 0 && (
                    <div className="px-7 pb-4 -mt-1">
                      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground border-t border-dashed pt-2.5 mt-2">
                        <span className="text-primary font-bold mr-1.5">Attached</span>
                        {uploadedFiles
                          .map((f) => `${f.filename} · ${f.fileId.slice(0, 6)}`)
                          .join("  ·  ")}
                      </div>
                    </div>
                  )}
                </div>

                <div className="joseph-composer relative" style={{ zIndex: 1 }}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-base font-medium text-foreground">
                      Search within Organisational Documents?
                    </span>
                    <button
                      type="button"
                      onClick={() => setKbEnabled((v) => !v)}
                      className="flex items-center gap-2.5 focus:outline-none"
                      title={kbEnabled ? "Knowledge Base ON — click to disable" : "Knowledge Base OFF — click to enable"}
                      role="switch"
                      aria-checked={kbEnabled}
                    >
                      <span className={`text-xs font-semibold transition-colors ${kbEnabled ? "text-primary" : "text-muted-foreground"}`}>
                        {kbEnabled ? "ON" : "OFF"}
                      </span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors ${
                          kbEnabled ? "bg-primary border-primary" : "bg-muted border-border"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                            kbEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                  <div className="flex items-end gap-2.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={onFilePicked}
                    />
                    <button
                      className="joseph-composer__icon-btn"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming}
                      title="Attach a document"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={
                        hasAnyPanel
                          ? "Talk to Joseph — describe the use case, drop a number, push back on a score…"
                          : "Start a new assessment — describe the AI use case you want to evaluate…"
                      }
                      rows={1}
                      className="joseph-composer__field max-h-32"
                      disabled={isStreaming}
                    />
                    <button
                      className="joseph-composer__send"
                      onClick={() => handleSend()}
                      disabled={isStreaming || !inputValue.trim()}
                    >
                      {isStreaming ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-3 h-3" />
                          Send
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            );

            // Empty state — chat owns the full viewport. Centered, max-width
            // for readability. This is the "starter screen" moment.
            if (!hasAnyPanel) {
              return (
                <div className="flex-1 min-h-0 flex justify-center px-4 pb-4 pt-4">
                  <div className="joseph-chat-surface joseph-chat-surface--solo">
                    {ChatBlock}
                  </div>
                </div>
              );
            }

            // Split layout — chat + materialized side panel
            return (
              <PanelGroup
                direction="horizontal"
                autoSaveId="consulting-agent-pane"
                className="flex-1 min-h-0 px-4 pb-4 pt-4"
              >
                <Panel defaultSize={60} minSize={40} className="flex flex-col min-h-0 joseph-chat-surface">
                  {ChatBlock}
                </Panel>

                <PanelResizeHandle className="joseph-resize" />

                <Panel defaultSize={40} minSize={30} maxSize={55} className="flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto px-1 py-1 space-y-4 joseph-side-gallery">
                    {(() => {
                      // Numbering follows the order of appearance, not framework order.
                      const order: { key: string; show: boolean }[] = [
                        { key: "kb", show: hasKb },
                        { key: "coverage", show: hasCoverage },
                        { key: "scores", show: hasScores },
                        { key: "citations", show: hasCitations },
                        { key: "report", show: hasReport },
                      ];
                      const numberOf = (key: string) => {
                        const visible = order.filter((o) => o.show);
                        const idx = visible.findIndex((o) => o.key === key);
                        return idx < 0 ? "00" : String(idx + 1).padStart(2, "0");
                      };
                      return null;
                    })()}

                    {hasKb && (
                      <div
                        ref={(el) => { sectionRefs.current.kb = el; }}
                        className="joseph-panel-reveal"
                        style={{ animationDelay: "0.05s" }}
                      >
                        <CollapsibleSection
                          num={(() => {
                            const order = [hasKb, hasCoverage, hasScores, hasCitations, hasReport];
                            return String(order.slice(0, 0).filter(Boolean).length + 1).padStart(2, "0");
                          })()}
                          title="Knowledge base hits"
                          badge={`${kbResults.filter((r) => r.consumed).length}/${kbResults.length}`}
                          expanded={expandedSections.has("kb")}
                          onToggle={() => toggleSection("kb")}
                          accent="kb"
                        >
                          <KnowledgeBasePanel
                            results={kbResults}
                            query={kbQuery}
                            onConsume={handleConsumeKb}
                            onConsumeTopN={handleConsumeTopN}
                            headless
                          />
                        </CollapsibleSection>
                      </div>
                    )}

                    {hasCoverage && (
                      <div
                        ref={(el) => { sectionRefs.current.coverage = el; }}
                        className="joseph-panel-reveal"
                        style={{ animationDelay: "0.1s" }}
                      >
                        <CollapsibleSection
                          num={(() => {
                            const order = [hasKb, hasCoverage, hasScores, hasCitations, hasReport];
                            return String(order.slice(0, 1).filter(Boolean).length + 1).padStart(2, "0");
                          })()}
                          title="Discovery coverage"
                          badge={
                            coverage
                              ? `${Object.values(coverage).filter((c) => c.touched).length}/5`
                              : "0/5"
                          }
                          expanded={expandedSections.has("coverage")}
                          onToggle={() => toggleSection("coverage")}
                          accent="coverage"
                        >
                          <CoverageIndicator coverage={coverage} headless />
                        </CollapsibleSection>
                      </div>
                    )}

                    {hasScores && (
                      <div
                        ref={(el) => { sectionRefs.current.scores = el; }}
                        className="joseph-panel-reveal"
                        style={{ animationDelay: "0.15s" }}
                      >
                        <CollapsibleSection
                          num={(() => {
                            const order = [hasKb, hasCoverage, hasScores, hasCitations, hasReport];
                            return String(order.slice(0, 2).filter(Boolean).length + 1).padStart(2, "0");
                          })()}
                          title="Scoring ledger"
                          badge={scores?.quadrant ? (QUADRANT_LABEL[scores.quadrant] ?? scores.quadrant) : null}
                          expanded={expandedSections.has("scores")}
                          onToggle={() => toggleSection("scores")}
                          accent="scores"
                        >
                          <ScoringPanel scores={scores} headless onRescore={handleRescore} />
                        </CollapsibleSection>
                      </div>
                    )}

                    {hasCitations && (
                      <div
                        ref={(el) => { sectionRefs.current.citations = el; }}
                        className="joseph-panel-reveal"
                        style={{ animationDelay: "0.2s" }}
                      >
                        <CollapsibleSection
                          num={(() => {
                            const order = [hasKb, hasCoverage, hasScores, hasCitations, hasReport];
                            return String(order.slice(0, 3).filter(Boolean).length + 1).padStart(2, "0");
                          })()}
                          title="Sources cited"
                          badge={citations.length}
                          expanded={expandedSections.has("citations")}
                          onToggle={() => toggleSection("citations")}
                          accent="citations"
                        >
                          <div className="space-y-0.5">
                            {citations.map((c) => (
                              <div className="joseph-cite" key={c.url}>
                                <CitationBadge tier={c.tier} valid={c.valid} />
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="joseph-cite__url"
                                  title={c.url}
                                >
                                  <span className="joseph-cite__pub">
                                    {c.publisher || c.url}
                                  </span>
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </CollapsibleSection>
                      </div>
                    )}

                    {hasReport && (
                      <div
                        ref={(el) => { sectionRefs.current.report = el; }}
                        className="joseph-panel-reveal"
                        style={{ animationDelay: "0.25s" }}
                      >
                        <CollapsibleSection
                          num={(() => {
                            const order = [hasKb, hasCoverage, hasScores, hasCitations, hasReport];
                            return String(order.slice(0, 4).filter(Boolean).length + 1).padStart(2, "0");
                          })()}
                          title="Deliverable"
                          badge={scores?.quadrant ? (QUADRANT_LABEL[scores.quadrant] ?? scores.quadrant) : "Ready"}
                          expanded={expandedSections.has("report")}
                          onToggle={() => toggleSection("report")}
                          accent="report"
                        >
                          <div className="joseph-action-ribbon">
                            <div className="joseph-action-ribbon__row">
                              <button
                                className="joseph-pill"
                                onClick={() => handleExport("pdf")}
                                disabled={exporting !== null}
                              >
                                {exporting === "pdf" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileText className="w-3 h-3" />
                                )}
                                PDF
                              </button>
                              <button
                                className="joseph-pill"
                                onClick={() => handleExport("docx")}
                                disabled={exporting !== null}
                              >
                                {exporting === "docx" ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileType className="w-3 h-3" />
                                )}
                                DOCX
                              </button>
                            </div>
                            <button
                              className="joseph-pill"
                              onClick={handleSaveToInsights}
                              disabled={isSavingInsights || savedToInsights}
                            >
                              {isSavingInsights ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Library className="w-3 h-3" />
                              )}
                              {savedToInsights ? "Saved to Insights" : "Save to Insights"}
                            </button>
                            <button
                              className="joseph-pill joseph-pill--primary"
                              onClick={() => setVeloxOpen(true)}
                            >
                              <ArrowRight className="w-3 h-3" />
                              Handoff
                            </button>
                          </div>
                        </CollapsibleSection>
                      </div>
                    )}
                  </div>
                </Panel>
              </PanelGroup>
            );
          })()}
        </div>
      </MainLayout>

      <VeloxHandoffModal
        open={veloxOpen}
        onOpenChange={setVeloxOpen}
        payload={veloxPayload}
      />
    </div>
  );
};

export default ConsultingAgent;
