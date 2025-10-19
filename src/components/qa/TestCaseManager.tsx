import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Sparkles, Trash2, Edit } from "lucide-react";

export const TestCaseManager = () => {
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [featureDescription, setFeatureDescription] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("Testing");

  const loadTestCases = async () => {
    const { data, error } = await supabase
      .from("test_cases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load test cases",
        variant: "destructive",
      });
    } else {
      setTestCases(data || []);
    }
  };

  useEffect(() => {
    loadTestCases();
  }, []);

  const handleGenerateTestCases = async () => {
    if (!featureDescription.trim()) {
      toast({
        title: "Error",
        description: "Please describe the feature to test",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-test-cases-qa", {
        body: {
          feature: featureDescription,
          existingTestCases: testCases.map((tc) => tc.title),
          phase: selectedPhase,
        },
      });

      if (error) throw error;

      // Insert generated test cases
      for (const testCase of data.testCases) {
        await supabase.from("test_cases").insert({
          title: testCase.title,
          description: testCase.description,
          steps: testCase.steps,
          expected_result: testCase.expectedResult,
          priority: testCase.priority,
          phase: testCase.phase,
          tags: testCase.tags,
          status: "draft",
        });
      }

      await loadTestCases();
      setIsDialogOpen(false);
      setFeatureDescription("");

      toast({
        title: "Success!",
        description: `Generated ${data.testCases.length} test cases`,
      });
    } catch (error) {
      console.error("Error generating test cases:", error);
      toast({
        title: "Error",
        description: "Failed to generate test cases",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteTestCase = async (id: string) => {
    const { error } = await supabase.from("test_cases").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete test case",
        variant: "destructive",
      });
    } else {
      await loadTestCases();
      toast({
        title: "Deleted",
        description: "Test case removed successfully",
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-500",
      high: "bg-orange-500",
      medium: "bg-yellow-500",
      low: "bg-blue-500",
    };
    return colors[priority] || "bg-gray-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Test Cases</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Test Cases</DialogTitle>
              <DialogDescription>
                Describe the feature you want to test, and AI will generate comprehensive test cases
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Feature Description</label>
                <Textarea
                  placeholder="e.g., User login with email and password..."
                  value={featureDescription}
                  onChange={(e) => setFeatureDescription(e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>
              <div>
                <label className="text-sm font-medium">SDLC Phase</label>
                <Select value={selectedPhase} onValueChange={setSelectedPhase}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Requirements">Requirements</SelectItem>
                    <SelectItem value="Design">Design</SelectItem>
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                    <SelectItem value="Deployment">Deployment</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerateTestCases}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? "Generating..." : "Generate Test Cases"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {testCases.map((testCase) => (
          <Card key={testCase.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{testCase.title}</h3>
                  <Badge className={getPriorityColor(testCase.priority)}>
                    {testCase.priority}
                  </Badge>
                  <Badge variant="outline">{testCase.phase}</Badge>
                  <Badge variant="outline">{testCase.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{testCase.description}</p>
                {testCase.steps && testCase.steps.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium">Steps:</p>
                    <ol className="list-decimal list-inside text-sm text-muted-foreground">
                      {testCase.steps.map((step: string, i: number) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {testCase.expected_result && (
                  <p className="text-sm">
                    <span className="font-medium">Expected:</span> {testCase.expected_result}
                  </p>
                )}
                {testCase.tags && testCase.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {testCase.tags.map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTestCase(testCase.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
