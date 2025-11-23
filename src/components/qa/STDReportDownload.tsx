import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { downloadSTDReport } from "@/utils/pdfGenerator";
import { useToast } from "@/hooks/use-toast";

interface STDReportDownloadProps {
  report: any;
}

export const STDReportDownload = ({ report }: STDReportDownloadProps) => {
  const { toast } = useToast();

  const handleDownload = () => {
    try {
      console.log('Starting PDF generation with report:', report);
      
      // Transform report data into format for PDF generator
      let testResults = report.detailedTests || [];
      console.log('detailedTests found:', testResults.length);
      
      // If detailedTests not available, create comprehensive tests from all available data
      if (testResults.length === 0) {
        console.log('No detailedTests, creating from report structure');
        const allTests = [];
        
        // Convert critical issues to test format
        if (report.criticalIssues && Array.isArray(report.criticalIssues)) {
          report.criticalIssues.forEach((issue: any) => {
            allTests.push({
              category: 'Security',
              testName: issue.type || 'Critical Issue',
              status: 'fail',
              description: issue.description || 'Critical issue found',
              actions: '1. Analyze the issue\n2. Review the affected code\n3. Implement security fix',
              details: `Location: ${issue.location || 'N/A'}\nImpact: ${issue.impact || 'High'}\nRecommendation: ${issue.recommendation || 'Fix immediately'}`
            });
          });
        }
        
        // Convert high priority issues to test format
        if (report.highPriorityIssues && Array.isArray(report.highPriorityIssues)) {
          report.highPriorityIssues.forEach((issue: any) => {
            allTests.push({
              category: 'Functionality',
              testName: issue.type || 'High Priority Issue',
              status: 'fail',
              description: issue.description || 'High priority issue found',
              actions: '1. Review the issue\n2. Check affected functionality\n3. Implement fix',
              details: `Location: ${issue.location || 'N/A'}\nRecommendation: ${issue.recommendation || 'Address soon'}`
            });
          });
        }
        
        // Convert warnings to test format
        if (report.warnings && Array.isArray(report.warnings)) {
          report.warnings.forEach((issue: any) => {
            allTests.push({
              category: 'Code Quality',
              testName: issue.type || 'Warning',
              status: 'partial',
              description: issue.description || 'Warning found',
              actions: '1. Review the warning\n2. Assess impact\n3. Consider improvements',
              details: `Location: ${issue.location || 'N/A'}\nRecommendation: ${issue.recommendation || 'Consider fixing'}`
            });
          });
        }
        
        // Convert passed checks to test format
        if (report.passedChecks && Array.isArray(report.passedChecks)) {
          report.passedChecks.forEach((check: any) => {
            allTests.push({
              category: 'Sanity',
              testName: check.type || 'Passed Check',
              status: 'pass',
              description: check.description || 'Check passed',
              actions: '1. Verified functionality\n2. Confirmed expected behavior',
              details: `Location: ${check.location || 'N/A'}\nStatus: Working as expected`
            });
          });
        }
        
        testResults = allTests;
        console.log('Created tests from report structure:', testResults.length);
      }
      
      // If still no tests, warn but allow PDF generation (summary-only report)
      if (testResults.length === 0) {
        console.warn('No detailed test data found in report, generating summary-only PDF');
        toast({
          title: "No Detailed Tests",
          description: "Generating a summary-only STD PDF based on the report data.",
        });
      }
 
      const metadata = {
        source: report.metadata?.source || report.summary?.source || 'Unknown',
        timestamp: report.summary?.timestamp || new Date().toISOString(),
        totalTests: testResults.length,
        passed: testResults.filter((t: any) => t.status === 'pass').length,
        failed: testResults.filter((t: any) => t.status === 'fail').length
      };

      console.log('Generating PDF with', testResults.length, 'tests');
      downloadSTDReport(report);
      
      toast({
        title: "Report Downloaded",
        description: `STD report with ${testResults.length} tests has been generated successfully`,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Download Failed",
        description: "Failed to generate PDF report. Check console for details.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button 
      onClick={handleDownload}
      className="gap-2"
      size="lg"
    >
      <FileDown className="w-4 h-4" />
      Download STD Report (PDF)
    </Button>
  );
};
