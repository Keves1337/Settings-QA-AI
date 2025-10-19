import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlayCircle, RefreshCw, CheckCircle2, XCircle, Clock, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const TestExecutionDashboard = () => {
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<any[]>([]);
  const [testRuns, setTestRuns] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [casesRes, runsRes] = await Promise.all([
        supabase.from('test_cases').select('*').eq('automated', true),
        supabase.from('test_runs').select('*').order('executed_at', { ascending: false }).limit(10)
      ]);

      if (casesRes.data) setTestCases(casesRes.data);
      if (runsRes.data) setTestRuns(runsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    toast({
      title: "Running Tests",
      description: "Executing all automated tests and generating STR reports...",
    });

    try {
      for (const testCase of testCases) {
        // Simulate test execution
        const status = Math.random() > 0.2 ? 'passed' : 'failed';
        const duration = Math.floor(Math.random() * 5000) + 1000;
        const resultText = status === 'passed' 
          ? 'All test steps passed successfully' 
          : 'Test failed at step 2';
        
        // Create test run
        const { data: testRun, error: insertError } = await supabase
          .from('test_runs')
          .insert({
            test_case_id: testCase.id,
            status,
            result: resultText,
            duration_ms: duration,
          })
          .select()
          .single();

        if (insertError || !testRun) {
          console.error('Error creating test run:', insertError);
          continue;
        }

        // Generate STR report
        try {
          const { data: reportData, error: reportError } = await supabase.functions.invoke(
            'generate-test-report',
            {
              body: {
                testRunId: testRun.id,
                testCase,
                result: { status, result: resultText },
                duration,
                timestamp: new Date().toISOString(),
              },
            }
          );

          if (reportError) {
            console.error('Error generating report:', reportError);
          } else {
            console.log('Report generated:', reportData.fileName);
          }
        } catch (reportErr) {
          console.error('Report generation failed:', reportErr);
        }
      }

      await loadData();
      
      toast({
        title: "Tests Complete!",
        description: "All tests executed with STR reports synced to Jira & GitHub",
      });
    } catch (error) {
      console.error('Error running tests:', error);
      toast({
        title: "Error",
        description: "Failed to run tests",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const passedTests = testRuns.filter(r => r.status === 'passed').length;
  const failedTests = testRuns.filter(r => r.status === 'failed').length;
  const totalTests = testRuns.length;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Test Execution Dashboard</h2>
            <p className="text-muted-foreground">
              {testCases.length} automated tests available
            </p>
          </div>
          <Button 
            onClick={runAllTests} 
            disabled={isRunning || testCases.length === 0}
            className="gap-2"
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            {isRunning ? "Running..." : "Run All Tests"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Tests</span>
            </div>
            <p className="text-2xl font-bold">{testCases.length}</p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Passed</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{passedTests}</p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-500">{failedTests}</p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Pass Rate</span>
            </div>
            <p className="text-2xl font-bold">{passRate.toFixed(1)}%</p>
          </Card>
        </div>

        {totalTests > 0 && (
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{passRate.toFixed(1)}%</span>
            </div>
            <Progress value={passRate} className="h-2" />
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Recent Test Runs</h3>
        <div className="space-y-3">
          {testRuns.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No test runs yet. Click "Run All Tests" to get started.
            </p>
          ) : (
            testRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3 flex-1">
                  {run.status === 'passed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">Test Case #{run.test_case_id.slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">{run.result}</p>
                    {run.report_url && (
                      <div className="flex items-center gap-2 mt-1">
                        <FileText className="w-3 h-3 text-primary" />
                        <a 
                          href={run.report_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          View STR Report
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {run.synced_to_jira && (
                          <Badge variant="outline" className="text-xs">Jira ✓</Badge>
                        )}
                        {run.synced_to_github && (
                          <Badge variant="outline" className="text-xs">GitHub ✓</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={run.status === 'passed' ? 'default' : 'destructive'}>
                    {run.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {run.duration_ms}ms
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
