import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Play, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export const TestExecutionPanel = () => {
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<any[]>([]);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [executionStatus, setExecutionStatus] = useState("pending");
  const [notes, setNotes] = useState("");
  const [testRuns, setTestRuns] = useState<any[]>([]);

  const loadTestCases = async () => {
    const { data, error } = await supabase
      .from("test_cases")
      .select("*")
      .in("status", ["draft", "ready", "approved"])
      .order("priority", { ascending: false });

    if (!error && data) {
      setTestCases(data);
    }
  };

  const loadTestRuns = async () => {
    const { data, error } = await supabase
      .from("test_runs")
      .select("*, test_cases(*)")
      .order("executed_at", { ascending: false })
      .limit(10);

    if (!error && data) {
      setTestRuns(data);
    }
  };

  useEffect(() => {
    loadTestCases();
    loadTestRuns();
  }, []);

  const executeTest = (testCase: any) => {
    setSelectedTest(testCase);
    setExecutionStatus("pending");
    setNotes("");
  };

  const recordTestRun = async () => {
    if (!selectedTest) return;

    const { error } = await supabase.from("test_runs").insert({
      test_case_id: selectedTest.id,
      status: executionStatus,
      notes,
      executed_at: new Date().toISOString(),
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to record test run",
        variant: "destructive",
      });
    } else {
      // Update last_executed_at on test case
      await supabase
        .from("test_cases")
        .update({ last_executed_at: new Date().toISOString() })
        .eq("id", selectedTest.id);

      toast({
        title: "Success",
        description: "Test run recorded successfully",
      });

      setSelectedTest(null);
      loadTestRuns();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "blocked":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">Execute Tests</h2>
        <div className="grid gap-4">
          {testCases.map((testCase) => (
            <Card key={testCase.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{testCase.title}</h3>
                    <Badge>{testCase.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{testCase.description}</p>
                </div>
                <Button onClick={() => executeTest(testCase)} className="gap-2">
                  <Play className="w-4 h-4" />
                  Run Test
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Recent Test Runs</h2>
        <div className="space-y-2">
          {testRuns.map((run) => (
            <Card key={run.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(run.status)}
                  <div>
                    <p className="font-medium">{run.test_cases?.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(run.executed_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Badge variant={run.status === "passed" ? "default" : "destructive"}>
                  {run.status}
                </Badge>
              </div>
              {run.notes && (
                <p className="text-sm text-muted-foreground mt-2">{run.notes}</p>
              )}
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedTest} onOpenChange={() => setSelectedTest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Execute Test: {selectedTest?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTest?.steps && (
              <div>
                <p className="font-medium mb-2">Test Steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  {selectedTest.steps.map((step: string, i: number) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
            {selectedTest?.expected_result && (
              <div>
                <p className="font-medium">Expected Result:</p>
                <p className="text-sm text-muted-foreground">{selectedTest.expected_result}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Test Result</label>
              <Select value={executionStatus} onValueChange={setExecutionStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Add any notes or observations..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <Button onClick={recordTestRun} className="w-full">
              Record Test Run
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
