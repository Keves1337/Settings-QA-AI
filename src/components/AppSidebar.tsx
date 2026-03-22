import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  FlaskConical,
  Cpu,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    description: "Projects & pipeline",
  },
  {
    title: "QA Testing",
    url: "/qa-testing",
    icon: FlaskConical,
    description: "Test cases & bug tracker",
  },
  {
    title: "Automated QA",
    url: "/automated-qa",
    icon: Cpu,
    description: "AI analysis & load testing",
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out successfully" });
  };

  return (
    <Sidebar className="border-r-0" style={{
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(32px) saturate(180%)",
      WebkitBackdropFilter: "blur(32px) saturate(180%)",
      borderRight: "1px solid rgba(255,255,255,0.07)",
    }}>
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <ShieldCheck className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">QA Platform</p>
            <p className="truncate text-xs text-muted-foreground">Testing & Automation</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-tight text-muted-foreground/60">
          Designed, built &amp; tested by{" "}
          <span className="font-medium text-muted-foreground/80">Johnatan Milrad</span>
        </p>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => navigate(item.url)}
                      tooltip={item.description}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarSeparator className="mb-3" />
        <div className="flex items-center justify-end px-1">
          <SidebarMenuButton
            onClick={handleSignOut}
            className="w-auto gap-2 text-muted-foreground hover:text-destructive"
            tooltip="Sign out"
            data-testid="button-sign-out"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-xs">Sign out</span>
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
