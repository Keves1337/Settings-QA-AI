import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import QATesting from "./pages/QATesting";
import AutomatedQA from "./pages/AutomatedQA";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const isGithubPages =
  typeof window !== "undefined" && window.location.hostname.endsWith("github.io");

const App = () => {
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
