import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  ArrowLeft,
  Paperclip,
  Send,
  RotateCcw,
  FileText,
  FileType,
  ArrowRight,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MainLayout } from "@/components/layout/MainLayout";
import { toast } from "sonner";
import { ScoringPanel } from "@/components/consulting/ScoringPanel";
import { CoverageIndicator } from "@/components/consulting/CoverageIndicator";
import { PriorityMatrix } from "@/components/consulting/PriorityMatrix";
import { CitationBadge } from "@/components/consulting/CitationBadge";
import { VeloxHandoffModal } from "@/components/consulting/VeloxHandoffModal";
import {
  buildVeloxHandoffPayload,
  exportReport,
  fetchSiblings,
  streamConsultingMessage,
  uploadDocument,
  type CitationPayload,
  type CoveragePayload,
  type ScoresPayload,
  type Sibling,
} from "@/services/consultingAgentApi";

type ChatTurn = {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: string;
  isLoading?: boolean;
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

  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<
    { fileId: string; filename: string }[]
  >([]);

  const [veloxOpen, setVeloxOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchSiblings()
      .then(setSiblings)
      .catch((e) => console.warn("Could not load sibling assessments:", e));
  }, []);

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

  const shortSession = sessionId
    ? sessionId.split("-").slice(-1)[0].slice(0, 8)
    : "—";

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
    setUploadedFiles([]);
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

    const sidForRequest = sessionId;
    const resetForRequest = pendingReset;

    try {
      let accumulated = "";
      for await (const event of streamConsultingMessage(
        text,
        sidForRequest,
        resetForRequest,
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
          if (event.kind === "scores") setScores(event.payload);
          else if (event.kind === "coverage") setCoverage(event.payload);
          else if (event.kind === "citations") setCitations(event.payload);
          else if (event.kind === "report") setCurrentReport(event.payload);
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
          {/* ── Editorial briefing strip ───────────────────────────── */}
          <header className="joseph-strip">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Home
              </button>
              <span className="text-muted-foreground/40">·</span>
              <div className="usage-section-mark">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                <span className="usage-section-num">00</span>
                <span>Consulting Dossier · Joseph</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="joseph-stamp">
                <span className="joseph-stamp__key">CASE</span>
                <span>{shortSession}</span>
              </span>
              <button
                onClick={handleReset}
                disabled={isStreaming}
                className="joseph-pill"
              >
                <RotateCcw className="w-3 h-3" />
                New
              </button>
            </div>
          </header>

          <PanelGroup direction="horizontal" autoSaveId="consulting-agent-pane" className="flex-1 min-h-0 px-4 pb-4 pt-4">
            <Panel defaultSize={62} minSize={42} className="flex flex-col min-h-0 joseph-chat-surface">
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto relative"
                style={{ zIndex: 1 }}
              >
                <Transcript turns={turns} isStreaming={isStreaming} />

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

              {/* ── Composer ───────────────────────────────────────── */}
              <div className="joseph-composer relative" style={{ zIndex: 1 }}>
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
                    placeholder="Talk to Joseph — describe the use case, drop a number, push back on a score…"
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
            </Panel>

            <PanelResizeHandle className="joseph-resize" />

            <Panel defaultSize={38} minSize={30} maxSize={55} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-1 py-1 space-y-4 joseph-side-gallery">
                <div className="stagger-1"><CoverageIndicator coverage={coverage} sheetNum="01" /></div>
                <div className="stagger-2"><ScoringPanel scores={scores} sheetNum="02" /></div>
                <div className="stagger-3"><PriorityMatrix siblings={siblings} current={scores?.axes ?? null} sheetNum="03" /></div>

                {citations.length > 0 && (
                  <section className="joseph-sheet stagger-4">
                    <span className="joseph-sheet__num">04</span>
                    <div className="joseph-sheet__title">
                      <span className="joseph-sheet__title-text">
                        Sources cited
                      </span>
                      <span className="ml-auto text-[9px] font-mono tabular-nums tracking-[0.18em] uppercase text-muted-foreground">
                        {citations.length}
                      </span>
                    </div>
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
                  </section>
                )}

                {currentReport && (
                  <section className="joseph-sheet stagger-5">
                    <span className="joseph-sheet__num">05</span>
                    <div className="joseph-sheet__title">
                      <span className="joseph-sheet__title-text">
                        Deliverable
                      </span>
                      {scores?.quadrant && (
                        <span className="ml-auto text-[9px] font-mono font-bold tracking-[0.18em] uppercase text-primary">
                          {scores.quadrant}
                        </span>
                      )}
                    </div>
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
                        className="joseph-pill joseph-pill--primary"
                        onClick={() => setVeloxOpen(true)}
                      >
                        <ArrowRight className="w-3 h-3" />
                        Velox handoff
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </Panel>
          </PanelGroup>
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
