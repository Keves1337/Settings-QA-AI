import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield, Zap, Bug, FileText, Activity, Lock,
  Eye, EyeOff, AlertTriangle, BarChart3, Cpu, Globe
} from "lucide-react";

const FEATURES = [
  {
    icon: Globe,
    color: "#6366f1",
    glow: "rgba(99,102,241,0.35)",
    title: "AI-Powered URL Analysis",
    desc: "Instantly fetch any website and run deep AI QA — security headers, accessibility, SEO, and performance — all in one click.",
  },
  {
    icon: Zap,
    color: "#ef4444",
    glow: "rgba(239,68,68,0.35)",
    title: "Load & DDoS Stress Testing",
    desc: "Simulate hundreds of concurrent users hitting your target. Real HTTP floods with live throughput graphs and an emergency kill switch.",
  },
  {
    icon: Shield,
    color: "#10b981",
    glow: "rgba(16,185,129,0.35)",
    title: "Real-Time Security Scanning",
    desc: "Detect missing CSP, clickjacking vectors, CORS misconfigurations, MIME-sniffing risks, and more — automatically.",
  },
  {
    icon: Bug,
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.35)",
    title: "Fuzz Testing Engine",
    desc: "Bombard your endpoints with malformed, boundary, and injection payloads. Find crashes before attackers do.",
  },
  {
    icon: Activity,
    color: "#8b5cf6",
    glow: "rgba(139,92,246,0.35)",
    title: "SDLC Pipeline Management",
    desc: "Track every phase of your development lifecycle — Planning → Requirements → Design → Dev → Testing → Deployment.",
  },
  {
    icon: FileText,
    color: "#06b6d4",
    glow: "rgba(6,182,212,0.35)",
    title: "PDF Test Reports",
    desc: "Generate professional QA reports with one click — complete with charts, findings, and recommendations, ready to share.",
  },
  {
    icon: BarChart3,
    color: "#ec4899",
    glow: "rgba(236,72,153,0.35)",
    title: "Bug Tracking & Analytics",
    desc: "Log, prioritize, and track bugs across sprints. See real-time stats on test coverage, active projects, and completion rates.",
  },
  {
    icon: Cpu,
    color: "#14b8a6",
    glow: "rgba(20,184,166,0.35)",
    title: "Automated Test Generation",
    desc: "AI writes your test cases for you — upload any file or URL and receive a full suite of edge-case tests instantly.",
  },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [featureIdx, setFeatureIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; idx: number }[]>([]);
  const [toastCounter, setToastCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setFeatureIdx(i => (i + 1) % FEATURES.length);
        setVisible(true);
      }, 400);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const scheduleNext = () => {
      const delay = 1600 + Math.random() * 1400;
      return setTimeout(() => {
        const rand = Math.floor(Math.random() * FEATURES.length);
        const id = Date.now();
        setToastCounter(c => c + 1);
        setToasts(q => {
          const next = [...q.slice(-2), { id, idx: rand }];
          return next;
        });
      }, delay);
    };
    const t = scheduleNext();
    return () => clearTimeout(t);
  }, [toastCounter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = login(username, password);
    if (!ok) {
      setError("Invalid credentials. Access denied.");
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }
  };

  const feature = FEATURES[featureIdx];
  const FeatureIcon = feature.icon;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{ background: "hsl(228 30% 4%)" }}
    >
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob" style={{
          width: "55%", height: "55%", top: "-15%", left: "-10%",
          background: "radial-gradient(ellipse, rgba(109,40,217,0.22) 0%, transparent 70%)",
          animationDuration: "14s",
        }} />
        <div className="blob" style={{
          width: "45%", height: "45%", top: "20%", right: "-12%",
          background: "radial-gradient(ellipse, rgba(59,130,246,0.16) 0%, transparent 70%)",
          animationDuration: "18s", animationDelay: "-4s",
        }} />
        <div className="blob" style={{
          width: "40%", height: "40%", bottom: "-10%", left: "25%",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.14) 0%, transparent 70%)",
          animationDuration: "16s", animationDelay: "-8s",
        }} />
      </div>

      {/* Floating feature toasts (top-right) */}
      <div className="fixed top-6 right-6 flex flex-col gap-3 pointer-events-none" style={{ zIndex: 20, maxWidth: 280 }}>
        {toasts.map((t, i) => {
          const f = FEATURES[t.idx];
          const Icon = f.icon;
          return (
            <div
              key={t.id}
              style={{
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(20px)",
                border: `1px solid ${f.color}44`,
                borderRadius: 12,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: `0 0 20px ${f.glow}`,
                opacity: i === toasts.length - 1 ? 1 : 0.45,
                transform: `scale(${i === toasts.length - 1 ? 1 : 0.94})`,
                transition: "all 0.4s ease",
                animation: "toastSlideIn 0.4s ease forwards",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: `${f.color}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${f.color}44`,
              }}>
                <Icon size={16} style={{ color: f.color }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: f.color, lineHeight: 1.2 }}>{f.title}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.3, marginTop: 2 }}>
                  {f.desc.slice(0, 58)}…
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <div
        className="w-full mx-auto px-4 flex flex-col lg:flex-row items-center gap-10 lg:gap-20"
        style={{ maxWidth: 960, position: "relative", zIndex: 10 }}
      >
        {/* Left: feature showcase (desktop only) */}
        <div className="flex-1 hidden lg:flex flex-col gap-7">
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
              color: "rgba(99,102,241,0.85)", textTransform: "uppercase", marginBottom: 14,
            }}>
              BehemothQA Platform
            </div>
            <h1 style={{
              fontSize: 44, fontWeight: 800, lineHeight: 1.12,
              background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: 16,
            }}>
              Industrial-grade<br />QA Testing Suite
            </h1>
            <p style={{ color: "rgba(255,255,255,0.42)", fontSize: 15, lineHeight: 1.75, maxWidth: 370 }}>
              AI analysis, real HTTP load testing, DDoS simulation, security scanning, fuzz testing, and full SDLC pipeline management.
            </p>
          </div>

          {/* Animated feature card */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            border: `1px solid ${feature.color}2e`,
            borderRadius: 20,
            padding: "28px 30px",
            boxShadow: `0 0 50px ${feature.glow}, inset 0 0 0 1px rgba(255,255,255,0.04)`,
            minHeight: 148,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.35s ease, transform 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: `${feature.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${feature.color}44`,
                boxShadow: `0 0 24px ${feature.glow}`,
              }}>
                <FeatureIcon size={24} style={{ color: feature.color }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 9 }}>
                  {feature.title}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 1.7 }}>
                  {feature.desc}
                </div>
              </div>
            </div>
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {FEATURES.map((f, i) => (
              <button
                key={i}
                onClick={() => { setVisible(false); setTimeout(() => { setFeatureIdx(i); setVisible(true); }, 200); }}
                style={{
                  width: i === featureIdx ? 22 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === featureIdx ? f.color : "rgba(255,255,255,0.14)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* Right: Login form */}
        <div style={{ width: "100%", maxWidth: 390 }}>
          {/* Mobile header */}
          <div className="lg:hidden text-center mb-8">
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(99,102,241,0.85)", textTransform: "uppercase", marginBottom: 8 }}>
              BehemothQA
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 800,
              background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Industrial QA Suite
            </h1>
          </div>

          {/* Glass card */}
          <div style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            padding: "36px 32px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)",
            animation: shaking ? "shake 0.5s ease" : "none",
          }}>
            {/* Lock header */}
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
                background: "rgba(99,102,241,0.14)",
                border: "1px solid rgba(99,102,241,0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 28px rgba(99,102,241,0.22)",
              }}>
                <Lock size={24} style={{ color: "#6366f1" }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                Access Required
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>
                This platform is private.<br />Enter your credentials to continue.
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <Label style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Username
                </Label>
                <Input
                  data-testid="input-username"
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(""); }}
                  autoComplete="username"
                  placeholder="Enter username"
                  style={{
                    marginTop: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${error ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 14,
                    height: 46,
                    transition: "border-color 0.2s ease",
                  }}
                />
              </div>

              <div>
                <Label style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Password
                </Label>
                <div style={{ position: "relative", marginTop: 8 }}>
                  <Input
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${error ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 12,
                      color: "#fff",
                      fontSize: 14,
                      height: 46,
                      paddingRight: 46,
                      transition: "border-color 0.2s ease",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "rgba(255,255,255,0.32)", padding: 0,
                      display: "flex", alignItems: "center",
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  borderRadius: 10, padding: "10px 14px",
                  color: "#f87171", fontSize: 13,
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <Button
                data-testid="button-login"
                type="submit"
                style={{
                  height: 48,
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 4px 24px rgba(99,102,241,0.38)",
                  marginTop: 4,
                }}
              >
                Unlock Platform
              </Button>
            </form>

            {/* Feature tags */}
            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center",
            }}>
              {["Load Testing", "DDoS Sim", "AI Analysis", "Fuzz Testing", "Security Scan", "PDF Reports"].map(tag => (
                <span key={tag} style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                  color: "rgba(255,255,255,0.28)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 6, padding: "3px 8px",
                }}>
                  {tag.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
            Designed, built & tested by Johnatan Milrad
          </div>
        </div>
      </div>

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-9px); }
          30%      { transform: translateX(9px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(6px); }
          75%      { transform: translateX(-3px); }
          90%      { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
