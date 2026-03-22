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
        <Card className="p-4 sm:p-6">
          <Tabs defaultValue="test-cases" className="space-y-6">
            <TabsList className="flex w-full overflow-x-auto h-auto gap-0 p-1 flex-nowrap scrollbar-none">
              <TabsTrigger value="test-cases" className="flex-shrink-0 gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm sm:px-3">
                <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Test Cases</span>
                <span className="sm:hidden">Tests</span>
              </TabsTrigger>
              <TabsTrigger value="execution" className="flex-shrink-0 gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm sm:px-3">
                <Play className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Execution</span>
              </TabsTrigger>
              <TabsTrigger value="bugs" className="flex-shrink-0 gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm sm:px-3">
                <Bug className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Bugs</span>
              </TabsTrigger>
              <TabsTrigger value="load-testing" className="flex-shrink-0 gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm sm:px-3">
                <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Load Testing</span>
                <span className="sm:hidden">Load</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-shrink-0 gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm sm:px-3">
                <Settings className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Integrations</span>
                <span className="sm:hidden">Config</span>
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
