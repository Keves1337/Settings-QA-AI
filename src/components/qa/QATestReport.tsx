import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, CheckCircle, Info, Languages, FileDown, FlaskConical, Zap, Bug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { STDReportDownload } from "./STDReportDownload";
import { generateQAReportPDF } from "@/lib/generatePDF";

interface QAReportItem {
  type: string;
  description: string;
  location?: string;
  recommendation?: string;
  impact?: string;
  howTested?: string;
  howCaused?: string;
}

interface QATestReportProps {
  report: any;
}

const SeverityBadge = ({ severity }: { severity: "critical" | "high" | "warning" | "pass" }) => {
  const styles = {
    critical: "bg-red-500/20 text-red-400 border-red-500/40",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    pass: "bg-green-500/20 text-green-400 border-green-500/40",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[severity]}`}>
      {severity}
    </span>
  );
};

const IssueCard = ({
  issue,
  severity,
}: {
  issue: QAReportItem;
  severity: "critical" | "high" | "warning" | "pass";
}) => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  const translateToHebrew = async () => {
    setIsTranslating(true);
    try {
      const textToTranslate = [
        issue.description,
        issue.impact ? `Impact: ${issue.impact}` : "",
        issue.recommendation ? `Fix: ${issue.recommendation}` : "",
      ].filter(Boolean).join("\n\n");

      const res = await fetch("/api/translate-to-hebrew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data?.translatedText) {
        setTranslatedText(data.translatedText);
        toast.success("Translated to Hebrew");
      }
    } catch {
      toast.error("Translation failed");
    } finally {
      setIsTranslating(false);
    }
  };

  const borderColors = {
    critical: "border-red-500/30",
    high: "border-orange-500/30",
    warning: "border-yellow-500/30",
    pass: "border-green-500/30",
  };

  const bgColors = {
    critical: "bg-red-500/5",
    high: "bg-orange-500/5",
    warning: "bg-yellow-500/5",
    pass: "bg-green-500/5",
  };

  const leftBorderColors = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    warning: "bg-yellow-500",
    pass: "bg-green-500",
  };

  return (
    <div
      className={`relative rounded-xl border ${borderColors[severity]} ${bgColors[severity]} overflow-hidden`}
      style={{ backdropFilter: "blur(12px)" }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${leftBorderColors[severity]}`} />
      <div className="pl-4 pr-4 pt-3 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={severity} />
            <span className="font-semibold text-sm text-white/90">{issue.type}</span>
            {issue.type?.includes("[Bizarre]") && (
              <span className="inline-flex items-center gap-1 text-[10px] text-purple-400 border border-purple-500/30 rounded-full px-2 py-0.5 bg-purple-500/10">
                <Zap className="w-2.5 h-2.5" /> Bizarre Test
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(issue.howTested || issue.howCaused) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMethodology(!showMethodology)}
                className="h-6 px-2 text-[11px] text-blue-400/70 hover:text-blue-300"
              >
                <FlaskConical className="w-3 h-3 mr-1" />
                {showMethodology ? "Hide" : "How tested"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={translateToHebrew}
              disabled={isTranslating}
              className="h-6 px-2 text-white/40 hover:text-white/70"
            >
              <Languages className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Location */}
        {issue.location && (
          <p className="text-[11px] text-white/35 mb-2 font-mono truncate">{issue.location}</p>
        )}

        {translatedText ? (
          <div className="space-y-2 text-right" dir="rtl">
            <p className="text-sm text-white/85 whitespace-pre-line">{translatedText}</p>
            <Button variant="ghost" size="sm" onClick={() => setTranslatedText(null)} className="text-xs text-white/50">
              Show English
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-white/80">{issue.description}</p>

            {issue.impact && (
              <div className="rounded-lg p-2.5 bg-orange-500/8 border border-orange-500/20">
                <p className="text-[11px] text-orange-400/90">
                  <span className="font-bold">⚠ Impact: </span>{issue.impact}
                </p>
              </div>
            )}

            {showMethodology && (
              <div className="space-y-2 mt-2">
                {issue.howTested && (
                  <div className="rounded-lg p-2.5 bg-blue-500/8 border border-blue-500/20">
                    <p className="text-[11px] text-blue-300/90">
                      <span className="font-bold">🔬 How Tested: </span>{issue.howTested}
                    </p>
                  </div>
                )}
                {issue.howCaused && (
                  <div className="rounded-lg p-2.5 bg-yellow-500/8 border border-yellow-500/20">
                    <p className="text-[11px] text-yellow-300/90">
                      <span className="font-bold">⚡ How Caused: </span>{issue.howCaused}
                    </p>
                  </div>
                )}
              </div>
            )}

            {issue.recommendation && (
              <div className="rounded-lg p-2.5 bg-green-500/8 border border-green-500/20">
                <p className="text-[11px] text-green-400/90">
                  <span className="font-bold">✓ Fix: </span>{issue.recommendation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const QATestReport = ({ report }: QATestReportProps) => {
  const r = report || {};
  const summary = r.summary || {};
  const criticalIssues: QAReportItem[] = r.criticalIssues || [];
  const highPriorityIssues: QAReportItem[] = r.highPriorityIssues || [];
  const warnings: QAReportItem[] = r.warnings || [];
  const passedChecks: QAReportItem[] = r.passedChecks || [];

  const totalIssues = criticalIssues.length + highPriorityIssues.length + warnings.length;
  const totalTests = summary.totalTests || (totalIssues + passedChecks.length);

  const overallStatus = summary.overallStatus || "warning";

  const handlePDFExport = () => {
    try {
      generateQAReportPDF(report);
      toast.success("PDF downloaded successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    }
  };

  const StatusIcon = overallStatus === "pass"
    ? <CheckCircle className="w-7 h-7 text-green-400" />
    : overallStatus === "fail"
    ? <AlertCircle className="w-7 h-7 text-red-400" />
    : <AlertTriangle className="w-7 h-7 text-yellow-400" />;

  const statusLabel = overallStatus === "pass" ? "All Clear" : overallStatus === "fail" ? "Critical Failures" : "Needs Attention";
  const statusColor = overallStatus === "pass" ? "text-green-400" : overallStatus === "fail" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Executive Summary Card ─────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">QA Security Report</h2>
            <p className="text-xs text-white/40 font-mono">{summary.source || r.metadata?.source || "Analyzed target"}</p>
            {summary.testedAt && (
              <p className="text-[11px] text-white/30 mt-0.5">{new Date(summary.testedAt).toLocaleString()}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={handlePDFExport} className="gap-2 text-sm h-9">
              <FileDown className="w-4 h-4" />
              Export PDF
            </Button>
            <STDReportDownload report={report} />
            <div className={`flex items-center gap-2 ${statusColor}`}>
              {StatusIcon}
              <div>
                <div className="text-sm font-bold">{statusLabel}</div>
                <div className="text-[11px] text-white/40">{totalTests} tests run</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Critical", value: criticalIssues.length, color: "red" },
            { label: "High", value: highPriorityIssues.length, color: "orange" },
            { label: "Warnings", value: warnings.length, color: "yellow" },
            { label: "Passed", value: passedChecks.length, color: "green" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className={`text-center p-4 rounded-xl border border-${color}-500/25 bg-${color}-500/8`}
              style={{ backdropFilter: "blur(8px)" }}
            >
              <div className={`text-3xl font-black text-${color}-400`}>{value}</div>
              <div className={`text-xs text-${color}-400/70 mt-1 font-medium`}>{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar visualization */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-white/40 mb-1">
            <span>Risk Distribution</span>
            <span>{totalTests} total tests</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden flex">
            {criticalIssues.length > 0 && (
              <div className="bg-red-500 h-full transition-all" style={{ width: `${(criticalIssues.length / totalTests) * 100}%` }} />
            )}
            {highPriorityIssues.length > 0 && (
              <div className="bg-orange-500 h-full transition-all" style={{ width: `${(highPriorityIssues.length / totalTests) * 100}%` }} />
            )}
            {warnings.length > 0 && (
              <div className="bg-yellow-500 h-full transition-all" style={{ width: `${(warnings.length / totalTests) * 100}%` }} />
            )}
            {passedChecks.length > 0 && (
              <div className="bg-green-500 h-full transition-all" style={{ width: `${(passedChecks.length / totalTests) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-4 flex-wrap pt-1">
            {[
              { color: "bg-red-500", label: "Critical" },
              { color: "bg-orange-500", label: "High" },
              { color: "bg-yellow-500", label: "Warning" },
              { color: "bg-green-500", label: "Passed" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[11px] text-white/40">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Bizarre test callout */}
        {[...criticalIssues, ...highPriorityIssues, ...warnings].some(i => i.type?.includes("[Bizarre]")) && (
          <div className="mt-4 rounded-xl border border-purple-500/30 bg-purple-500/8 p-3 flex items-start gap-2">
            <Bug className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-purple-300">Bizarre / Edge-Case Tests Included</p>
              <p className="text-[11px] text-purple-400/70 mt-0.5">
                This report includes non-standard attack surface tests: DOM clobbering, prototype pollution, data URI abuse, base tag hijacking, and more. Click "How tested" on any finding for full methodology.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── Detailed Findings (severity ordered) ─────────────────────────── */}
      <Card className="p-5">
        <Accordion type="multiple" defaultValue={["critical", "high"]} className="space-y-3">

          {criticalIssues.length > 0 && (
            <AccordionItem value="critical" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 overflow-hidden">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <span className="font-bold text-red-400">Critical Issues</span>
                  <span className="rounded-full bg-red-500/20 text-red-400 text-xs px-2 py-0.5 font-mono">{criticalIssues.length}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2 pb-4">
                {criticalIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} severity="critical" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {highPriorityIssues.length > 0 && (
            <AccordionItem value="high" className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 overflow-hidden">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                  <span className="font-bold text-orange-400">High Priority Issues</span>
                  <span className="rounded-full bg-orange-500/20 text-orange-400 text-xs px-2 py-0.5 font-mono">{highPriorityIssues.length}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2 pb-4">
                {highPriorityIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} severity="high" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {warnings.length > 0 && (
            <AccordionItem value="warnings" className="rounded-xl border border-yellow-500/25 bg-yellow-500/5 px-4 overflow-hidden">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-yellow-400 shrink-0" />
                  <span className="font-bold text-yellow-400">Warnings</span>
                  <span className="rounded-full bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 font-mono">{warnings.length}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2 pb-4">
                {warnings.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} severity="warning" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {passedChecks.length > 0 && (
            <AccordionItem value="passed" className="rounded-xl border border-green-500/25 bg-green-500/5 px-4 overflow-hidden">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <span className="font-bold text-green-400">Passed Checks</span>
                  <span className="rounded-full bg-green-500/20 text-green-400 text-xs px-2 py-0.5 font-mono">{passedChecks.length}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2 pb-4">
                {passedChecks.map((check, idx) => (
                  <IssueCard key={idx} issue={check} severity="pass" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

        </Accordion>
      </Card>
    </div>
  );
};
