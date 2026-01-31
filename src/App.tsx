import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import QATesting from "./pages/QATesting";
import AutomatedQA from "./pages/AutomatedQA";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const isGithubPages =
  typeof window !== "undefined" && window.location.hostname.endsWith("github.io");

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
      
      setLoading(false);
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        supabase.auth.signInAnonymously();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {isGithubPages ? (
          <HashRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/qa-testing" element={<QATesting />} />
              <Route path="/automated-qa" element={<AutomatedQA />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        ) : (
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/qa-testing" element={<QATesting />} />
            <Route path="/automated-qa" element={<AutomatedQA />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
