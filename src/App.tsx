import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import QATesting from "./pages/QATesting";
import AutomatedQA from "./pages/AutomatedQA";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="blob"
        style={{
          width: "55%", height: "55%",
          top: "-15%", left: "-10%",
          background: "radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, transparent 70%)",
          animationDuration: "14s",
        }}
      />
      <div
        className="blob"
        style={{
          width: "45%", height: "45%",
          top: "20%", right: "-12%",
          background: "radial-gradient(ellipse, rgba(59,130,246,0.14) 0%, transparent 70%)",
          animationDuration: "18s",
          animationDelay: "-4s",
        }}
      />
      <div
        className="blob"
        style={{
          width: "40%", height: "40%",
          bottom: "-10%", left: "25%",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)",
          animationDuration: "16s",
          animationDelay: "-8s",
        }}
      />
      <div
        className="blob"
        style={{
          width: "30%", height: "30%",
          top: "55%", left: "5%",
          background: "radial-gradient(ellipse, rgba(20,184,166,0.10) 0%, transparent 70%)",
          animationDuration: "20s",
          animationDelay: "-2s",
        }}
      />
      <div
        className="blob"
        style={{
          width: "25%", height: "25%",
          top: "10%", left: "45%",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.08) 0%, transparent 70%)",
          animationDuration: "22s",
          animationDelay: "-11s",
        }}
      />
    </div>
  );
}

function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header
            className="flex h-12 shrink-0 items-center gap-2 px-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-1 text-white/60 hover:text-white/90" />
            <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>QA Testing Platform</span>
          </header>
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/qa-testing" element={<QATesting />} />
              <Route path="/automated-qa" element={<AutomatedQA />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AmbientBackground />
          <AppLayout />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
