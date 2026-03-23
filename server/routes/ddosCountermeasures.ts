import type { Request, Response } from "express";
import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;

interface TestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  totalDurationSeconds: number;
  successRate: number;
  statusCodes: Record<string, number>;
  attackMode: boolean;
  aborted?: boolean;
}

function buildAttackProfile(url: string, domain: string, r: TestResult): string {
  const statusSummary = Object.entries(r.statusCodes)
    .map(([code, count]) => `  - HTTP ${code}: ${count.toLocaleString()} responses`)
    .join("\n");

  return `
TARGET URL:           ${url}
DOMAIN:               ${domain}
Total Requests Sent:  ${r.totalRequests.toLocaleString()}
Successful (2xx):     ${r.successfulRequests.toLocaleString()} (${r.successRate}%)
Blocked / Failed:     ${r.failedRequests.toLocaleString()} (${(100 - r.successRate).toFixed(1)}%)
Peak Throughput:      ${r.requestsPerSecond} req/s
Avg Response Time:    ${r.averageResponseTime}ms
Min / Max Response:   ${r.minResponseTime}ms / ${r.maxResponseTime}ms
Total Duration:       ${r.totalDurationSeconds}s
Status Codes:
${statusSummary || "  - No successful responses (all blocked/timeout)"}
Attack Vectors Used:  Randomized User-Agents (13 variants), Spoofed X-Forwarded-For IPs,
                      Cache-busting query params (_cb=, _t=), Mixed GET/HEAD methods,
                      Random referers (Google search simulation)
`.trim();
}

function generateFallbackReport(url: string, domain: string, r: TestResult, attackProfile: string): string {
  const date = new Date().toISOString().split("T")[0];
  const rps = r.requestsPerSecond;
  const rateLimit = Math.max(10, Math.floor(rps * 0.1));
  const blocked = (100 - r.successRate).toFixed(1);
  const vulnerable = r.successRate > 50;
  const connLimit = Math.max(5, Math.floor(rps / 50));
  const burstAllowed = Math.max(20, rateLimit * 2);
  const safeRps = Math.floor(rps * 0.3);

  return `╔══════════════════════════════════════════════════════════════════════════════╗
║          DDoS COUNTERMEASURES REPORT — BEHEMOTHQA PLATFORM                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Generated:  ${date}
Target:     ${url}
Domain:     ${domain}
Generator:  BehemothQA Security Analysis Engine

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Vulnerability Level: ${vulnerable ? "HIGH — Target served responses to majority of attack traffic" : "MODERATE — Target blocked majority of attack requests"}

The simulated DDoS attack achieved a ${r.successRate}% penetration rate at ${rps} req/s
peak throughput against ${domain}. ${blocked}% of requests were blocked or rejected.
Average response time under ${r.totalRequests.toLocaleString()} concurrent requests was ${r.averageResponseTime}ms,
indicating ${r.averageResponseTime > 2000 ? "SEVERE degradation — the site was effectively DoS'd" : r.averageResponseTime > 500 ? "moderate strain — the site slowed significantly" : "good resilience — the site held up under pressure"}.
Immediate hardening is ${vulnerable ? "CRITICAL" : "recommended"}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. ATTACK PROFILE OBSERVED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${attackProfile}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. NGINX RATE LIMITING CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# /etc/nginx/nginx.conf — http block (tailored to observed ${rps} req/s peak):
http {
    limit_req_zone  $binary_remote_addr zone=ddos_main:10m rate=${rateLimit}r/s;
    limit_req_zone  $binary_remote_addr zone=api_strict:10m rate=${Math.max(5, Math.floor(rateLimit / 2))}r/s;
    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;

    server {
        server_name ${domain};

        # Per-IP connection cap based on observed concurrency
        limit_conn conn_per_ip ${connLimit};

        # Block cache-busting patterns used in this attack
        if ($args ~* "_cb=|_t=[0-9]{13}") {
            return 403;
        }

        # Block bot/script User-Agents rotated during this attack
        if ($http_user_agent ~* "(curl|python-requests|Go-http-client|axios|Java\\/|bot|spider|crawl)") {
            return 429;
        }

        # Block spoofed X-Forwarded-For (single IP pattern = script)
        if ($http_x_forwarded_for ~* "^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$") {
            return 403;
        }

        location / {
            limit_req zone=ddos_main burst=${burstAllowed} nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /api/ {
            limit_req zone=api_strict burst=${Math.max(10, rateLimit)} nodelay;
            proxy_pass http://backend;
        }
    }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. EXPRESS.JS / NODE.JS COUNTER-MIDDLEWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// npm install express-rate-limit helmet
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

app.set('trust proxy', 1);

// Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Global limiter — tailored to observed ${rps} req/s attack intensity
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ${Math.max(30, rateLimit * 3)},
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Rate limit exceeded. Slow down.' }),
});

// Stricter for sensitive API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ${Math.max(10, rateLimit)},
  standardHeaders: true,
});

app.use(globalLimiter);
app.use('/api', apiLimiter);

// Block attack signatures observed in this test
app.use((req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  const url = req.originalUrl;

  // Bot/script agents used in this attack
  const suspiciousAgents = /curl|python-requests|Go-http-client|axios\\/|Java\\/|bot|spider|crawl/i;
  if (suspiciousAgents.test(ua)) {
    return res.status(429).json({ error: 'Automated requests are not permitted' });
  }

  // Cache-busting query params used in this attack (_cb=, _t=<epoch>)
  if (/_cb=|_t=[0-9]{13}/.test(url)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Single-hop X-Forwarded-For (spoofed by attacker scripts)
  const xff = req.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string' && /^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/.test(xff.trim())) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. CLOUDFLARE WAF RULES (Terraform)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

resource "cloudflare_filter" "behemothqa_ddos_${domain.replace(/\./g, "_")}" {
  zone_id     = var.zone_id
  description = "BehemothQA DDoS countermeasure for ${domain}"
  expression  = <<-EOT
    (http.request.uri.query contains "_cb=") or
    (http.request.uri.query contains "_t=") or
    (http.user_agent contains "python-requests") or
    (http.user_agent contains "Go-http-client") or
    (http.user_agent contains "axios") or
    (http.user_agent contains "curl") or
    (http.request.rate gt ${Math.floor(rps * 0.5)})
  EOT
}

resource "cloudflare_firewall_rule" "block_ddos_${domain.replace(/\./g, "_")}" {
  zone_id     = var.zone_id
  description = "Block DDoS signatures for ${domain}"
  filter_id   = cloudflare_filter.behemothqa_ddos_${domain.replace(/\./g, "_")}.id
  action      = "block"
  priority    = 1
}

# Enable Under Attack Mode when req/s exceeds ${Math.floor(rps * 0.8)}
resource "cloudflare_zone_settings_override" "security_${domain.replace(/\./g, "_")}" {
  zone_id = var.zone_id
  settings {
    security_level = "under_attack"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. IPTABLES RULES (Linux — tailored to observed ${rps} req/s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Limit concurrent connections per IP
iptables -A INPUT -p tcp --dport 80  -m connlimit --connlimit-above ${connLimit} -j REJECT --reject-with tcp-reset
iptables -A INPUT -p tcp --dport 443 -m connlimit --connlimit-above ${connLimit} -j REJECT --reject-with tcp-reset

# Rate limit new connections
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -m recent --set --name HTTP_FLOOD
iptables -A INPUT -p tcp --dport 80 -m state --state NEW -m recent --update --seconds 1 --hitcount ${Math.max(20, Math.floor(rps / 10))} --name HTTP_FLOOD -j DROP

iptables -A INPUT -p tcp --dport 443 -m state --state NEW -m recent --set --name HTTPS_FLOOD
iptables -A INPUT -p tcp --dport 443 -m state --state NEW -m recent --update --seconds 1 --hitcount ${Math.max(20, Math.floor(rps / 10))} --name HTTPS_FLOOD -j DROP

# SYN flood protection
iptables -A INPUT -p tcp --syn -m limit --limit ${Math.max(10, Math.floor(rps / 5))}/s --limit-burst ${Math.max(50, rps)} -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP

# Save
iptables-save > /etc/iptables/rules.v4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. PYTHON / DJANGO / FLASK MIDDLEWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Django settings.py
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'yourapp.middleware.DDoSProtectionMiddleware',  # Add this
    # ... rest of middleware ...
]

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
X_FRAME_OPTIONS = 'DENY'

# yourapp/middleware.py
import re
from django.core.cache import cache
from django.http import JsonResponse

SUSPICIOUS_UA = re.compile(r'curl|python-requests|Go-http-client|axios|Java/|bot|spider|crawl', re.I)
CACHE_BUST    = re.compile(r'_cb=|_t=[0-9]{13}')
RATE_LIMIT    = ${Math.max(30, rateLimit * 3)}   # Derived from observed ${rps} req/s attack
WINDOW_SECS   = 60

class DDoSProtectionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ua  = request.META.get('HTTP_USER_AGENT', '')
        ip  = request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR', '')
        uri = request.get_full_path()

        if SUSPICIOUS_UA.search(ua):
            return JsonResponse({'error': 'Automated requests not permitted'}, status=429)

        if CACHE_BUST.search(uri):
            return JsonResponse({'error': 'Forbidden'}, status=403)

        key   = f'bqa_rate_{ip}'
        count = cache.get(key, 0)
        if count >= RATE_LIMIT:
            return JsonResponse({'error': 'Too many requests'}, status=429)
        cache.set(key, count + 1, WINDOW_SECS)

        return self.get_response(request)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. MONITORING & ALERTING (Prometheus)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Alert thresholds derived from attack data:
  Fire when req/s > ${safeRps}           (30% of observed ${rps} req/s attack)
  Fire when error rate > 20% in 60s window
  Fire when avg response time > ${r.averageResponseTime * 3}ms (3x observed baseline)

# prometheus/alerts.yml
groups:
  - name: ddos_${domain.replace(/[^a-zA-Z0-9]/g, "_")}
    rules:
      - alert: DDoSHighRequestRate
        expr: rate(nginx_http_requests_total[1m]) > ${safeRps}
        for: 30s
        labels:
          severity: critical
          target: "${domain}"
        annotations:
          summary: "DDoS pattern detected on ${domain}"
          description: "Request rate {{ $value }} req/s exceeds ${safeRps} threshold"

      - alert: DDoSHighErrorRate
        expr: |
          rate(nginx_http_requests_total{status=~"4..|5.."}[1m])
          / rate(nginx_http_requests_total[1m]) > 0.2
        for: 30s
        labels:
          severity: warning

      - alert: DDoSResponseDegradation
        expr: nginx_http_request_duration_seconds{quantile="0.95"} > ${(r.averageResponseTime * 3 / 1000).toFixed(2)}
        for: 60s
        labels:
          severity: warning
          target: "${domain}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. EMERGENCY RESPONSE PLAYBOOK FOR ${domain.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trigger: req/s exceeds ${safeRps} OR error rate exceeds 20% OR response time exceeds ${r.averageResponseTime * 3}ms

  PHASE 1 — Immediate (0–5 min):
    □ Enable Cloudflare "Under Attack Mode" (JS challenge all visitors)
    □ Apply nginx rate limits from Section 3 above
    □ Block attacking IP ranges via WAF or iptables
    □ Notify on-call engineer

  PHASE 2 — Containment (5–30 min):
    □ Activate CDN scrubbing (Cloudflare / Akamai / AWS Shield Advanced)
    □ Apply iptables rules from Section 6 above on all edge nodes
    □ Scale backend horizontally behind load balancer
    □ Enable CAPTCHA challenge for all non-cached requests

  PHASE 3 — Analysis (30 min – 2 hrs):
    □ Dump access logs and extract attacking IP CIDR blocks
    □ Add permanent geo-blocking for regions with no legitimate traffic
    □ Tighten rate limits based on live traffic analysis
    □ Enable bot management (Cloudflare Bot Management or equivalent)

  PHASE 4 — Post-Attack:
    □ Review full access log for new attack signatures
    □ Update WAF rules, Nginx config, and iptables with new patterns
    □ Document incident timeline, volumes, and mitigation actions
    □ Re-run BehemothQA DDoS simulation to verify defenses held

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. RISK ASSESSMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Target:              ${domain}
  Attack Duration:     ${r.totalDurationSeconds}s
  Peak Load:           ${rps} req/s
  Vulnerability Level: ${vulnerable ? "HIGH" : "MODERATE"}
  Penetration Rate:    ${r.successRate}%
  Recommended Action:  ${vulnerable ? "IMMEDIATE hardening required — target absorbed majority of attack" : "Preventive hardening recommended — good baseline defense observed"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by BehemothQA Security Platform | Designed, built & tested by Johnatan Milrad
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

export async function generateDDoSCountermeasures(req: Request, res: Response) {
  const { url, results }: { url: string; results: TestResult } = req.body;

  if (!url || !results) {
    return res.status(400).json({ error: "url and results are required" });
  }

  let domain = url;
  try { domain = new URL(url).hostname; } catch {}

  const attackProfile = buildAttackProfile(url, domain, results);

  try {
    let report: string;

    if (client) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a senior cybersecurity engineer specializing in DDoS mitigation and web infrastructure hardening. 
Generate a detailed, implementation-ready countermeasures report specifically tailored to the attack profile provided.
Format it as a professional text document with numbered sections, ASCII borders, and actual runnable code blocks.
Every threshold, rate limit, and configuration value must be derived from the actual attack statistics provided.`,
          },
          {
            role: "user",
            content: `Generate a DDoS countermeasures report for this attack simulation against ${domain}:

${attackProfile}

Include these sections with actual values derived from the attack data above:
1. Executive Summary (vulnerability assessment based on the numbers)
2. Attack Profile (restate the data in analysis form)
3. Nginx Rate Limiting Config (with exact req/s limits based on the data)
4. Express.js / Node.js Counter-Middleware (copy-paste ready code)
5. Cloudflare WAF Rules (Terraform format, with exact rate thresholds)
6. iptables Rules (Linux, tailored to observed concurrency)
7. Python / Django / Flask Middleware
8. Prometheus Monitoring & Alerting Rules (with thresholds from this attack)
9. Emergency Response Playbook (with specific triggers from this attack)
10. Risk Assessment Summary

Make all thresholds, rate limits, and configuration values specific to the observed attack intensity.`,
          },
        ],
        max_tokens: 4500,
        temperature: 0.2,
      });

      report = completion.choices[0]?.message?.content || generateFallbackReport(url, domain, results, attackProfile);
    } else {
      report = generateFallbackReport(url, domain, results, attackProfile);
    }

    const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `ddos-countermeasures-${safeDomain}-${Date.now()}.txt`;
    res.json({ report, filename });
  } catch {
    const report = generateFallbackReport(url, domain, results, attackProfile);
    const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `ddos-countermeasures-${safeDomain}-${Date.now()}.txt`;
    res.json({ report, filename });
  }
}
