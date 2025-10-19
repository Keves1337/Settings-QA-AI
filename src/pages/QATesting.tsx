import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TestCaseManager } from "@/components/qa/TestCaseManager";
import { TestExecutionPanel } from "@/components/qa/TestExecutionPanel";
import { BugTracker } from "@/components/qa/BugTracker";
import { IntegrationSettings } from "@/components/qa/IntegrationSettings";
import { FlaskConical, Play, Bug, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const QATesting = () => {
  const { toast } = useToast();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  QA Testing Automation
                </h1>
                <p className="text-sm text-muted-foreground">
                  Comprehensive testing & bug tracking with Jira/GitHub integration
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="p-6">
          <Tabs defaultValue="test-cases" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
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
