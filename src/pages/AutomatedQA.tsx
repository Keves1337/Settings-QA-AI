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
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  const handleUrlAnalysis = async () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a URL to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setQaReport(null);
    setUploadedFiles([]);
    setProgress(0);
    setProgressMessage('Starting analysis...');

    try {
      // Use streaming endpoint with progress updates
      const authHeader = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-project-qa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authHeader}`,
          },
          body: JSON.stringify({ url: url.trim(), streaming: true })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to analyze URL: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.progress !== undefined) {
                  setProgress(parsed.progress);
                  setProgressMessage(parsed.message || '');
                } else if (parsed.summary) {
                  // Final result
                  finalData = parsed;
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }

      // Final flush in case of leftover buffered data
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.progress !== undefined) {
              setProgress(parsed.progress);
              setProgressMessage(parsed.message || '');
            } else if (parsed.summary) {
              finalData = parsed;
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            console.error('Failed to parse SSE data (final flush):', e);
          }
        }
      }

      if (!finalData) {
        throw new Error('No data returned from analysis');
      }

      // Add metadata if not present
      if (!finalData.metadata) {
        finalData.metadata = {
          source: url,
          analyzedFiles: 1,
          totalLines: 0
        };
      }
      if (!finalData.summary.source) {
        finalData.summary.source = url;
      }

      setQaReport(finalData);
      setProgress(100);
      setProgressMessage('Analysis complete!');
      
      const status = finalData.summary?.overallStatus || 'unknown';
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
      console.error('Error analyzing URL:', error);
      const errorMessage = error?.message || error?.error || "Failed to analyze URL. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setProgress(0);
      setProgressMessage('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFilesUploaded = async (files: File[]) => {
    // Client-side validation mirrors backend to avoid non-2xx errors
    if (files.length > 50) {
      toast({
        title: "Too many files",
        description: "Maximum 50 files allowed.",
        variant: "destructive",
      });
      return;
    }

    const oversized = files.filter((f) => f.size > 20_000_000);
    if (oversized.length > 0) {
      toast({
        title: "File too large",
        description: `The following files exceed 20MB: ${oversized.map(f => f.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setUploadedFiles(files);
    setIsGenerating(true);
    setQaReport(null);
    setProgress(0);
    setProgressMessage('Preparing files...');

    try {
      setProgress(10);
      setProgressMessage('Reading file contents...');
      // Read file contents with safe truncation to avoid oversized requests
      const MAX_PER_FILE = 200_000; // 200KB per file
      const MAX_TOTAL = 800_000;    // 800KB overall
      let totalChars = 0;
      const truncationNotes: string[] = [];

      const fileContents: Array<{ name: string; content: string; type: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(10 + (i / files.length) * 20);
        setProgressMessage(`Reading ${file.name}...`);
        let text = await file.text();
        if (text.length > MAX_PER_FILE) {
          truncationNotes.push(`- ${file.name}: truncated to ${MAX_PER_FILE} chars`);
          text = text.slice(0, MAX_PER_FILE);
        }
        if (totalChars + text.length > MAX_TOTAL) {
          const remaining = Math.max(0, MAX_TOTAL - totalChars);
          if (remaining <= 0) break;
          truncationNotes.push(`- ${file.name}: further truncated due to total cap`);
          text = text.slice(0, remaining);
        }
        totalChars += text.length;
        fileContents.push({ name: file.name, content: text, type: file.type });
        if (totalChars >= MAX_TOTAL) break;
      }

      setProgress(30);
      setProgressMessage('Sending to AI for analysis...');

      // Use streaming endpoint with progress updates
      const authHeader = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-project-qa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authHeader}`,
          },
          body: JSON.stringify({ files: fileContents, streaming: true })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to analyze files: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.progress !== undefined) {
                  // Map backend progress (30-100) to frontend progress (30-100)
                  setProgress(30 + (parsed.progress * 0.7));
                  setProgressMessage(parsed.message || '');
                } else if (parsed.summary) {
                  // Final result
                  finalData = parsed;
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }

      // Final flush in case of leftover buffered data
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.progress !== undefined) {
              setProgress(30 + (parsed.progress * 0.7));
              setProgressMessage(parsed.message || '');
            } else if (parsed.summary) {
              finalData = parsed;
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            console.error('Failed to parse SSE data (final flush):', e);
          }
        }
      }

      if (!finalData) {
        throw new Error('No data returned from analysis');
      }

      const data = finalData;
      const error = null;

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to analyze files');
      }

      if (!data) {
        throw new Error('No data returned from analysis');
      }

      // Add metadata if not present  
      if (!data.metadata) {
        data.metadata = {
          source: files.map(f => f.name).join(', '),
          analyzedFiles: files.length,
          totalLines: fileContents.reduce((sum, f) => sum + f.content.split('\n').length, 0)
        };
      }
      if (!data.summary.source) {
        data.summary.source = files[0]?.name || 'Unknown';
      }

      setQaReport(data);
      setProgress(100);
      setProgressMessage('Analysis complete!');
      
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
      setProgress(0);
      setProgressMessage('');
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
                  <h2 className="text-xl font-semibold mb-2">Analyze URL</h2>
                  <p className="text-muted-foreground">
                    Enter a URL to instantly fetch and analyze its content
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-background"
                    disabled={isGenerating}
                  />
                  <Button 
                    onClick={handleUrlAnalysis}
                    disabled={isGenerating || !url.trim()}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Analyze URL
                  </Button>
                </div>
              </div>
            </Card>

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
                {isGenerating && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{progressMessage}</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
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
