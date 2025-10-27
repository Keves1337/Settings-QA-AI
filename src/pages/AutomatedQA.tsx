import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadZone } from "@/components/qa/FileUploadZone";
import { QATestReport } from "@/components/qa/QATestReport";
import { TestExecutionDashboard } from "@/components/qa/TestExecutionDashboard";
import { TestReportsLibrary } from "@/components/qa/TestReportsLibrary";
import { FuzzTestingPanel } from "@/components/qa/FuzzTestingPanel";
import { Sparkles, LogOut, Settings, Zap, FileCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AutomatedQA = () => {
  const { toast } = useToast();
  const [qaReport, setQaReport] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  const handleFilesUploaded = async (files: File[]) => {
    setUploadedFiles(files);
    setIsGenerating(true);
    setQaReport(null);

    try {
      // Read file contents
      const fileContents = await Promise.all(
        files.map(async (file) => {
          const text = await file.text();
          return {
            name: file.name,
            content: text,
            type: file.type,
          };
        })
      );

      const { data, error } = await supabase.functions.invoke('analyze-project-qa', {
        body: { files: fileContents }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to analyze files');
      }

      if (!data) {
        throw new Error('No data returned from analysis');
      }

      setQaReport(data);
      
      const status = data.summary?.overallStatus || 'unknown';
      const statusMessages = {
        pass: '✅ All tests passed!',
        warning: '⚠️ Tests completed with warnings',
        fail: '❌ Critical issues found'
      };
      
      toast({
        title: "QA Analysis Complete",
        description: statusMessages[status] || "Analysis completed",
        variant: status === 'fail' ? 'destructive' : 'default'
      });
    } catch (error: any) {
      console.error('Error analyzing files:', error);
      const errorMessage = error?.message || error?.error || "Failed to analyze files. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="glass-premium sticky top-0 z-50 border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow smooth-transition hover:scale-110">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">
                  Automated QA Testing
                </h1>
                <p className="text-sm text-muted-foreground">
                  AI-powered test generation from your project files
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                Back to Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/qa-testing'}
              >
                <Settings className="w-4 h-4 mr-2" />
                QA Settings
              </Button>
              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">Upload & Test</TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <FileCheck className="w-4 h-4" />
              Test Report
            </TabsTrigger>
            <TabsTrigger value="execution">Test Execution</TabsTrigger>
            <TabsTrigger value="reports">STR Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card className="p-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Upload Files for QA Testing</h2>
                  <p className="text-muted-foreground">
                    Drag and drop any file (HTML, JavaScript, CSS, etc.) to automatically run QA tests and generate a detailed report
                  </p>
                </div>
                <FileUploadZone 
                  onFilesUploaded={handleFilesUploaded}
                  isProcessing={isGenerating}
                />
                {uploadedFiles.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-medium mb-2">Uploaded Files:</h3>
                    <ul className="space-y-1">
                      {uploadedFiles.map((file, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          • {file.name} ({(file.size / 1024).toFixed(2)} KB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="space-y-6">
            {qaReport ? (
              <QATestReport report={qaReport} />
            ) : (
              <Card className="p-12 text-center">
                <FileCheck className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No Report Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Upload files in the "Upload & Test" tab to generate a QA test report
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="execution" className="space-y-6">
            <TestExecutionDashboard />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <TestReportsLibrary />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AutomatedQA;
