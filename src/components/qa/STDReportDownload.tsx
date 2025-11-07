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
      // Transform report data into format for PDF generator
      const testResults = report.detailedTests || [];
      
      // If detailedTests not available, create from categories
      const transformedResults = testResults.length > 0 ? testResults : 
        (report.categories || []).flatMap((category: any) => 
          (category.tests || []).map((test: any) => ({
            category: category.name,
            testName: test.name,
            status: test.status === 'pass' ? 'pass' : 
                   test.status === 'warning' ? 'partial' : 'fail',
            description: test.message || 'No description',
            actions: test.actions || 'Automated test execution',
            details: `Expected: ${test.expected || 'N/A'}\nActual: ${test.actual || 'N/A'}\n${test.recommendation || ''}`
          }))
        );

      const metadata = {
        source: report.metadata?.source || report.summary?.source || 'Unknown',
        timestamp: report.summary?.timestamp || new Date().toISOString(),
        totalTests: report.summary?.totalTests || transformedResults.length,
        passed: report.summary?.passed || 0,
        failed: report.summary?.failed || 0
      };

      downloadSTDReport(transformedResults, metadata);
      
      toast({
        title: "Report Downloaded",
        description: "STD report has been generated and downloaded successfully",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Download Failed",
        description: "Failed to generate PDF report",
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
