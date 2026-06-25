import { useState } from "react";
import { Copy, Check, Download, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface VeloxHandoffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: Record<string, unknown> | null;
}

export const VeloxHandoffModal = ({
  open,
  onOpenChange,
  payload,
}: VeloxHandoffModalProps) => {
  const [copied, setCopied] = useState(false);
  const jsonText = payload ? JSON.stringify(payload, null, 2) : "{}";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "velox-handoff.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-primary" />
            Handoff payload
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This payload contains the sponsor, planning value, open threads, and
          viability flags needed to plan the implementation.
        </p>
        <pre className="mt-3 max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] font-mono leading-relaxed">
          {jsonText}
        </pre>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy JSON
              </>
            )}
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
