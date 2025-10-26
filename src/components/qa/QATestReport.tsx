import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, CheckCircle, Info, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface QAReportItem {
  type: string;
  description: string;
  location: string;
  recommendation?: string;
  impact?: string;
}

interface QAReportSummary {
  totalFiles: number;
  criticalIssues: number;
  highPriorityIssues: number;
  warnings: number;
  passedChecks: number;
  overallStatus: 'pass' | 'warning' | 'fail';
}

interface QATestReportProps {
  report: {
    summary: QAReportSummary;
    criticalIssues: QAReportItem[];
    highPriorityIssues: QAReportItem[];
    warnings: QAReportItem[];
    passedChecks: QAReportItem[];
  };
}

const IssueCard = ({ issue, idx, color }: { issue: QAReportItem; idx: number; color: 'red' | 'orange' | 'yellow' }) => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const translateToHebrew = async () => {
    setIsTranslating(true);
    try {
      const textToTranslate = `${issue.description}${issue.impact ? `\n\nImpact: ${issue.impact}` : ''}${issue.recommendation ? `\n\nFix: ${issue.recommendation}` : ''}`;
      
      const { data, error } = await supabase.functions.invoke('translate-to-hebrew', {
        body: { text: textToTranslate }
      });

      if (error) throw error;
      
      if (data?.translatedText) {
        setTranslatedText(data.translatedText);
        toast.success('Translated to Hebrew');
      }
    } catch (error) {
      console.error('Translation error:', error);
      toast.error('Failed to translate');
    } finally {
      setIsTranslating(false);
    }
  };

  const borderColor = color === 'red' ? 'border-red-200 dark:border-red-800' : 
                      color === 'orange' ? 'border-orange-200 dark:border-orange-800' : 
                      'border-yellow-200 dark:border-yellow-800';
  
  const badgeColor = color === 'red' ? 'destructive' : 
                     color === 'orange' ? 'bg-orange-600' : 
                     'bg-yellow-600';

  return (
    <div className={`p-4 bg-background rounded-lg border ${borderColor}`}>
      <div className="flex items-start justify-between mb-2">
        <Badge variant={badgeColor as any} className={typeof badgeColor === 'string' ? badgeColor : ''}>
          {issue.type}
        </Badge>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{issue.location}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={translateToHebrew}
            disabled={isTranslating}
            className="h-7 px-2"
          >
            <Languages className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {translatedText ? (
        <div className="space-y-2 text-right" dir="rtl">
          <p className="font-medium whitespace-pre-line">{translatedText}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTranslatedText(null)}
            className="text-xs"
          >
            Show English
          </Button>
        </div>
      ) : (
        <>
          <p className="font-medium mb-2">{issue.description}</p>
          {issue.impact && (
            <p className="text-sm text-muted-foreground mb-2">
              <strong>Impact:</strong> {issue.impact}
            </p>
          )}
          {issue.recommendation && (
            <p className="text-sm text-muted-foreground">
              <strong>Fix:</strong> {issue.recommendation}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export const QATestReport = ({ report }: QATestReportProps) => {
  const defaultReport = {
    summary: {
      totalFiles: 0,
      criticalIssues: 0,
      highPriorityIssues: 0,
      warnings: 0,
      passedChecks: 0,
      overallStatus: 'pass' as const,
    },
    criticalIssues: [] as QAReportItem[],
    highPriorityIssues: [] as QAReportItem[],
    warnings: [] as QAReportItem[],
    passedChecks: [] as QAReportItem[],
  };

  const mapIssue = (i: any): QAReportItem => ({
    type: i?.type || 'issue',
    description: i?.description || 'Issue',
    location: i?.location || '',
    recommendation: i?.recommendation,
    impact: i?.impact,
  });

  const normalized = (() => {
    const r: any = report || {};
    if (r.summary) return r;
    if (Array.isArray(r.issues)) {
      const crit = r.issues.filter((i: any) => i?.severity === 'critical').map(mapIssue);
      const high = r.issues.filter((i: any) => i?.severity === 'high').map(mapIssue);
      const warn = r.issues.filter((i: any) => i?.severity === 'medium' || i?.severity === 'low').map(mapIssue);
      return {
        summary: {
          totalFiles: typeof r.totalFiles === 'number' ? r.totalFiles : 0,
          criticalIssues: crit.length,
          highPriorityIssues: high.length,
          warnings: warn.length,
          passedChecks: 0,
          overallStatus: crit.length > 0 ? 'fail' : (high.length > 0 ? 'warning' : 'pass'),
        },
        criticalIssues: crit,
        highPriorityIssues: high,
        warnings: warn,
        passedChecks: [],
      };
    }
    return defaultReport;
  })();

  const { summary, criticalIssues, highPriorityIssues, warnings, passedChecks } = normalized;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'text-green-600 dark:text-green-400';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400';
      case 'fail': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-8 h-8" />;
      case 'warning': return <AlertTriangle className="w-8 h-8" />;
      case 'fail': return <AlertCircle className="w-8 h-8" />;
      default: return <Info className="w-8 h-8" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="p-6 glass-premium">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">QA Test Report</h2>
            <p className="text-muted-foreground">
              Analyzed {summary.totalFiles} file{summary.totalFiles !== 1 ? 's' : ''}
            </p>
          </div>
          <div className={`flex items-center gap-3 ${getStatusColor(summary.overallStatus)}`}>
            {getStatusIcon(summary.overallStatus)}
            <div className="text-right">
              <div className="text-2xl font-bold uppercase">{summary.overallStatus}</div>
              <div className="text-sm">Overall Status</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {summary.criticalIssues}
            </div>
            <div className="text-sm text-red-600 dark:text-red-400 mt-1">Critical Issues</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {summary.highPriorityIssues}
            </div>
            <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">High Priority</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {summary.warnings}
            </div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">Warnings</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {summary.passedChecks}
            </div>
            <div className="text-sm text-green-600 dark:text-green-400 mt-1">Passed Checks</div>
          </div>
        </div>
      </Card>

      {/* Detailed Results */}
      <Card className="p-6">
        <Accordion type="multiple" className="space-y-4">
          {/* Critical Issues */}
          {criticalIssues.length > 0 && (
            <AccordionItem value="critical" className="border rounded-lg px-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    Critical Issues ({criticalIssues.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-4">
                {criticalIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} idx={idx} color="red" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* High Priority Issues */}
          {highPriorityIssues.length > 0 && (
            <AccordionItem value="high" className="border rounded-lg px-4 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    High Priority Issues ({highPriorityIssues.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-4">
                {highPriorityIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} idx={idx} color="orange" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <AccordionItem value="warnings" className="border rounded-lg px-4 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                    Warnings ({warnings.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-4">
                {warnings.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} idx={idx} color="yellow" />
                ))}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Passed Checks */}
          {passedChecks.length > 0 && (
            <AccordionItem value="passed" className="border rounded-lg px-4 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    Passed Checks ({passedChecks.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-4">
                {passedChecks.map((check, idx) => (
                  <div key={idx} className="p-4 bg-background rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-start justify-between mb-2">
                      <Badge className="bg-green-600">{check.type}</Badge>
                      <span className="text-sm text-muted-foreground">{check.location}</span>
                    </div>
                    <p className="font-medium">{check.description}</p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </Card>
    </div>
  );
};
