import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { TestCaseManager } from "@/components/qa/TestCaseManager";
import { TestExecutionPanel } from "@/components/qa/TestExecutionPanel";
import { BugTracker } from "@/components/qa/BugTracker";
import { IntegrationSettings } from "@/components/qa/IntegrationSettings";
import { LoadTestingPanel } from "@/components/qa/LoadTestingPanel";
import { FlaskConical, Play, Bug, Settings, Activity } from "lucide-react";

const QATesting = () => {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">QA Testing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Test cases, bug tracking & integrations</p>
        </div>
        <Card className="p-6">
          <Tabs defaultValue="test-cases" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="test-cases" className="gap-2">
                <FlaskConical className="w-4 h-4" />
                Test Cases
              </TabsTrigger>
              <TabsTrigger value="execution" className="gap-2">
                <Play className="w-4 h-4" />
                Execution
              </TabsTrigger>
              <TabsTrigger value="bugs" className="gap-2">
                <Bug className="w-4 h-4" />
                Bugs
              </TabsTrigger>
              <TabsTrigger value="load-testing" className="gap-2">
                <Activity className="w-4 h-4" />
                Load Testing
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="w-4 h-4" />
                Integrations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="test-cases" className="space-y-4">
              <TestCaseManager />
            </TabsContent>

            <TabsContent value="execution" className="space-y-4">
              <TestExecutionPanel />
            </TabsContent>

            <TabsContent value="bugs" className="space-y-4">
              <BugTracker />
            </TabsContent>

            <TabsContent value="load-testing" className="space-y-4">
              <LoadTestingPanel />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <IntegrationSettings />
            </TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
};

export default QATesting;
