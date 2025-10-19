import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadZone } from "@/components/qa/FileUploadZone";
import { AutomatedTestList } from "@/components/qa/AutomatedTestList";
import { TestExecutionDashboard } from "@/components/qa/TestExecutionDashboard";
import { TestReportsLibrary } from "@/components/qa/TestReportsLibrary";
import { Sparkles, PlayCircle, LogOut, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AutomatedQA = () => {
  const { toast } = useToast();
  const [generatedTests, setGeneratedTests] = useState<any[]>([]);
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

      if (error) throw error;

      setGeneratedTests(data.testCases || []);
      
      toast({
        title: "Tests Generated! ✨",
        description: `Created ${data.testCases?.length || 0} automated test cases from your project`,
      });
    } catch (error) {
      console.error('Error generating tests:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to analyze project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTests = async () => {
    try {
      const { error } = await supabase.from('test_cases').insert(
        generatedTests.map(test => ({
          title: test.title,
          description: test.description,
          steps: test.steps,
          expected_result: test.expectedResult,
          priority: test.priority,
          phase: test.phase,
          automated: true,
          status: 'approved',
        }))
      );

      if (error) throw error;

      toast({
        title: "Tests Saved!",
        description: "All automated tests have been saved to your test suite",
      });
    } catch (error) {
      console.error('Error saving tests:', error);
      toast({
        title: "Error",
        description: "Failed to save tests. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
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
            <TabsTrigger value="upload">Upload & Generate</TabsTrigger>
            <TabsTrigger value="tests">Generated Tests</TabsTrigger>
            <TabsTrigger value="execution">Test Execution</TabsTrigger>
            <TabsTrigger value="reports">STR Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card className="p-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Upload Your Project</h2>
                  <p className="text-muted-foreground">
                    Drag and drop your project files to automatically generate comprehensive test cases
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

          <TabsContent value="tests" className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold">Generated Test Cases</h2>
                  <p className="text-muted-foreground">
                    {generatedTests.length} automated tests ready to save
                  </p>
                </div>
                {generatedTests.length > 0 && (
                  <Button onClick={handleSaveTests} className="gap-2">
                    <PlayCircle className="w-4 h-4" />
                    Save All Tests
                  </Button>
                )}
              </div>
              <AutomatedTestList tests={generatedTests} />
            </Card>
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
