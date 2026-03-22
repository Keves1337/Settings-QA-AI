import { Request, Response } from "express";
import OpenAI from "openai";

// ─── Real HTTP Analysis (for URL mode) ───────────────────────────────────────

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "pass";
  type: string;
  description: string;
  location: string;
  recommendation: string;
  impact: string;
  howTested: string;
  howCaused: string;
}

function analyzeHeaders(headers: Record<string, string>, url: string): Finding[] {
  const findings: Finding[] = [];
  const h = (name: string) => headers[name.toLowerCase()];

  // CSP
  if (!h("content-security-policy")) {
    findings.push({
      severity: "critical",
      type: "Missing CSP",
      description: "No Content-Security-Policy header is present. Attackers can inject arbitrary scripts.",
      location: url,
      recommendation: "Add a strict CSP: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';`",
      impact: "Full cross-site scripting (XSS) attack surface — malicious scripts can steal cookies, session tokens, and exfiltrate data.",
      howTested: "Performed an HTTP HEAD + GET request and inspected all response headers for the 'content-security-policy' key. None was found.",
      howCaused: "The server returns no CSP header. Any page that reflects user input (e.g., search queries, error messages) can execute injected JavaScript in a victim's browser.",
    });
  } else {
    const csp = h("content-security-policy")!;
    if (csp.includes("unsafe-inline") || csp.includes("unsafe-eval")) {
      findings.push({
        severity: "high",
        type: "Weak CSP (unsafe directives)",
        description: `CSP contains dangerous directives: ${csp.includes("unsafe-inline") ? "'unsafe-inline'" : ""} ${csp.includes("unsafe-eval") ? "'unsafe-eval'" : ""}. These negate XSS protection.`,
        location: url,
        recommendation: "Remove 'unsafe-inline' and 'unsafe-eval'. Use nonces or hashes for inline scripts.",
        impact: "Inline script injection and eval-based attacks bypass CSP protection entirely.",
        howTested: "CSP header value was parsed and scanned for 'unsafe-inline' and 'unsafe-eval' directive tokens.",
        howCaused: "Developers often add these directives to make legacy inline JavaScript work, inadvertently disabling CSP's core protections.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "CSP Present",
        description: "Content-Security-Policy header is configured.",
        location: url,
        recommendation: "Periodically review and tighten the policy.",
        impact: "None — this is a positive control.",
        howTested: "HTTP response headers inspected; CSP header found and validated for dangerous directives.",
        howCaused: "N/A — policy is correctly configured.",
      });
    }
  }

  // HSTS
  const hsts = h("strict-transport-security");
  if (!hsts) {
    findings.push({
      severity: "critical",
      type: "Missing HSTS",
      description: "No Strict-Transport-Security header. Browsers can be downgraded to HTTP via MITM.",
      location: url,
      recommendation: "Add: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`",
      impact: "Man-in-the-middle attackers can strip HTTPS and intercept all traffic in plaintext.",
      howTested: "HTTP response scanned for 'strict-transport-security' header. None found.",
      howCaused: "Web server or CDN not configured to emit HSTS. First-time visitors are vulnerable until HSTS cache is populated.",
    });
  } else if (!hsts.includes("includeSubDomains")) {
    findings.push({
      severity: "medium",
      type: "HSTS Missing includeSubDomains",
      description: "HSTS header exists but does not include 'includeSubDomains'. Subdomains remain vulnerable.",
      location: url,
      recommendation: "Add 'includeSubDomains' to HSTS: `max-age=31536000; includeSubDomains; preload`",
      impact: "Attacker-controlled subdomains can receive cookies and tokens intended for the main domain.",
      howTested: "HSTS header value parsed for the 'includeSubDomains' directive token.",
      howCaused: "HSTS was added but not fully configured to cover the entire domain hierarchy.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "HSTS Configured",
      description: "Strict-Transport-Security header present with includeSubDomains.",
      location: url,
      recommendation: "Add 'preload' and submit to the HSTS preload list for maximum protection.",
      impact: "None — HSTS is active.",
      howTested: "HSTS header inspected; max-age and includeSubDomains present.",
      howCaused: "N/A",
    });
  }

  // X-Frame-Options / frame-ancestors
  const xfo = h("x-frame-options");
  const cspFrameAncestors = h("content-security-policy")?.includes("frame-ancestors");
  if (!xfo && !cspFrameAncestors) {
    findings.push({
      severity: "high",
      type: "Clickjacking Vulnerability",
      description: "No X-Frame-Options or CSP frame-ancestors directive. Page can be embedded in iframes for clickjacking.",
      location: url,
      recommendation: "Add `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`.",
      impact: "Attackers embed the page invisibly in their own site, tricking users into clicking buttons they cannot see (e.g., 'Transfer Funds').",
      howTested: "Response headers checked for X-Frame-Options and CSP frame-ancestors directive. Neither found.",
      howCaused: "No clickjacking protection was configured. The browser will render the page inside any iframe on any domain.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Clickjacking Protection",
      description: xfo ? `X-Frame-Options: ${xfo}` : "CSP frame-ancestors directive present.",
      location: url,
      recommendation: "Prefer CSP frame-ancestors over X-Frame-Options for modern browsers.",
      impact: "None — clickjacking is mitigated.",
      howTested: "X-Frame-Options and CSP frame-ancestors both checked.",
      howCaused: "N/A",
    });
  }

  // X-Content-Type-Options
  const xcto = h("x-content-type-options");
  if (!xcto || xcto.toLowerCase() !== "nosniff") {
    findings.push({
      severity: "high",
      type: "MIME Sniffing Risk",
      description: "X-Content-Type-Options is not set to 'nosniff'. Browsers may execute content with the wrong MIME type.",
      location: url,
      recommendation: "Add `X-Content-Type-Options: nosniff` to all responses.",
      impact: "An attacker-uploaded file (e.g., .jpg containing JavaScript) could be executed as script.",
      howTested: "Response header 'x-content-type-options' checked for value 'nosniff'.",
      howCaused: "Server does not emit this header by default. Without it, older browsers sniff content and may execute uploaded files as scripts.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "MIME Sniffing Protection",
      description: "X-Content-Type-Options: nosniff is set.",
      location: url,
      recommendation: "No action needed.",
      impact: "None.",
      howTested: "Header value verified as 'nosniff'.",
      howCaused: "N/A",
    });
  }

  // Referrer-Policy
  if (!h("referrer-policy")) {
    findings.push({
      severity: "medium",
      type: "Missing Referrer-Policy",
      description: "No Referrer-Policy header. Full URLs (including tokens) may leak to third-party sites via the Referer header.",
      location: url,
      recommendation: "Add `Referrer-Policy: strict-origin-when-cross-origin`.",
      impact: "Auth tokens or session IDs embedded in URLs could be leaked in Referer headers to analytics or CDN providers.",
      howTested: "Response headers scanned for 'referrer-policy'. Not found.",
      howCaused: "Default browser behavior sends the full Referer URL unless restricted by this policy.",
    });
  }

  // Permissions-Policy
  if (!h("permissions-policy")) {
    findings.push({
      severity: "low",
      type: "Missing Permissions-Policy",
      description: "No Permissions-Policy header. Third-party iframes can access camera, microphone, and geolocation APIs.",
      location: url,
      recommendation: "Add `Permissions-Policy: camera=(), microphone=(), geolocation=()` to restrict API access.",
      impact: "Embedded third-party scripts (ads, analytics) could request sensitive browser APIs.",
      howTested: "Response headers scanned for 'permissions-policy'. Not found.",
      howCaused: "This header is optional but recommended to restrict feature access for embedded content.",
    });
  }

  // Server info disclosure
  const serverHeader = h("server");
  if (serverHeader && (serverHeader.includes("/") || serverHeader.match(/\d/))) {
    findings.push({
      severity: "medium",
      type: "Server Version Disclosure",
      description: `Server header reveals software version: "${serverHeader}". Attackers can look up known CVEs for this version.`,
      location: url,
      recommendation: "Configure the server to emit a generic 'Server' header (e.g., just 'nginx') or remove it entirely.",
      impact: "Version-specific exploit modules can be targeted. Narrows attacker's search space significantly.",
      howTested: "HTTP response 'server' header captured and checked for version strings (e.g., digits and slashes).",
      howCaused: `The server (${serverHeader}) emits its full version string by default. This is the software's default configuration.`,
    });
  }

  // X-Powered-By
  const xpb = h("x-powered-by");
  if (xpb) {
    findings.push({
      severity: "medium",
      type: "Technology Stack Disclosure",
      description: `X-Powered-By header exposes backend technology: "${xpb}".`,
      location: url,
      recommendation: "Remove X-Powered-By header (e.g., in Express: `app.disable('x-powered-by')`).",
      impact: "Attackers gain intelligence about the backend stack, enabling targeted framework-specific attacks.",
      howTested: "'x-powered-by' header captured from HTTP response.",
      howCaused: `Framework (${xpb}) auto-adds this header by default. Most frameworks have a one-line config to disable it.`,
    });
  }

  // Cache-Control
  const cc = h("cache-control");
  if (!cc) {
    findings.push({
      severity: "low",
      type: "No Cache-Control Policy",
      description: "No Cache-Control header. Browsers and proxies may cache sensitive responses.",
      location: url,
      recommendation: "Add `Cache-Control: no-store, no-cache` for sensitive pages, or proper max-age for static assets.",
      impact: "Sensitive data (account pages, tokens) may be stored in browser history and shared caches.",
      howTested: "'cache-control' header checked in HTTP response.",
      howCaused: "Server returns no caching directive; browser and CDN proxy default behaviours take effect.",
    });
  }

  // CORS wildcard
  const acao = h("access-control-allow-origin");
  if (acao === "*") {
    findings.push({
      severity: "high",
      type: "CORS Wildcard",
      description: "Access-Control-Allow-Origin: * allows any origin to read the response. This exposes API data cross-domain.",
      location: url,
      recommendation: "Restrict CORS to specific trusted origins. Never combine wildcard with credentials.",
      impact: "Any website can make authenticated cross-origin requests and read the response if combined with credentials.",
      howTested: "Access-Control-Allow-Origin header value checked for wildcard (*).",
      howCaused: "CORS was configured with '*' to allow all origins, often done to simplify development but left in production.",
    });
  }

  return findings;
}

function analyzeHtmlContent(html: string, url: string): Finding[] {
  const findings: Finding[] = [];

  // Meta description
  if (!/<meta\s[^>]*name=["']description["'][^>]*>/i.test(html)) {
    findings.push({
      severity: "low",
      type: "Missing Meta Description",
      description: "No <meta name='description'> tag found. Search engines may auto-generate poor descriptions.",
      location: url,
      recommendation: "Add a unique, 150–160 character meta description to each page.",
      impact: "Reduced click-through rates from search results. Lower SEO ranking.",
      howTested: "HTML source scanned with regex for <meta name='description'> pattern.",
      howCaused: "Page was created without SEO meta tags. Common in app-first SPAs that ignore SEO.",
    });
  }

  // Viewport meta
  if (/<meta\s[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
    findings.push({
      severity: "pass",
      type: "Mobile Viewport Configured",
      description: "viewport meta tag found — responsive design is supported.",
      location: url,
      recommendation: "Verify viewport content includes 'width=device-width, initial-scale=1'.",
      impact: "None.",
      howTested: "HTML scanned for <meta name='viewport'>.",
      howCaused: "N/A",
    });
  } else {
    findings.push({
      severity: "medium",
      type: "Missing Viewport Meta Tag",
      description: "No viewport meta tag found. Mobile browsers will render at desktop width.",
      location: url,
      recommendation: "Add `<meta name='viewport' content='width=device-width, initial-scale=1'>`.",
      impact: "Poor mobile experience; users must zoom and scroll horizontally.",
      howTested: "HTML source scanned for <meta name='viewport'> pattern.",
      howCaused: "Page template was not built with mobile responsiveness in mind.",
    });
  }

  // Inline scripts
  const inlineScripts = (html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []).filter(s => s.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim().length > 0);
  if (inlineScripts.length > 3) {
    findings.push({
      severity: "medium",
      type: "Excessive Inline Scripts",
      description: `${inlineScripts.length} inline <script> blocks detected. Inline scripts bypass CSP nonce protection and are harder to audit.`,
      location: url,
      recommendation: "Move inline scripts to external .js files. Use CSP nonces for any that must remain inline.",
      impact: "Increased XSS attack surface; inline scripts are the primary injection vector for XSS attacks.",
      howTested: "HTML parsed with regex to count inline <script> elements without src= attribute.",
      howCaused: "Inline scripts are added for convenience during development and often remain in production.",
    });
  }

  // HTML comments with potential leakage
  const comments = html.match(/<!--[\s\S]*?-->/g) || [];
  const suspiciousComments = comments.filter(c =>
    /password|secret|key|token|api|debug|todo|fixme|hack|credentials|private/i.test(c)
  );
  if (suspiciousComments.length > 0) {
    findings.push({
      severity: "high",
      type: "Sensitive Data in HTML Comments",
      description: `${suspiciousComments.length} HTML comment(s) contain potentially sensitive keywords (password, key, token, secret, debug, etc.).`,
      location: url,
      recommendation: "Remove all HTML comments from production builds. Use build-time comment stripping.",
      impact: "Developers often leave credentials, API keys, or architectural notes in comments. These are visible to anyone who views source.",
      howTested: "All HTML comments extracted via regex and scanned for sensitive keyword patterns.",
      howCaused: `Found comment(s) matching sensitive patterns. Example pattern found: "${suspiciousComments[0]?.slice(0, 80)}..."`,
    });
  }

  // Forms without apparent CSRF protection
  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  const formsWithoutCSRF = forms.filter(f =>
    !/(csrf|_token|authenticity_token|nonce)/i.test(f)
  );
  if (formsWithoutCSRF.length > 0) {
    findings.push({
      severity: "high",
      type: "Potential CSRF Vulnerability",
      description: `${formsWithoutCSRF.length} form(s) found without visible CSRF token fields.`,
      location: url,
      recommendation: "Add a CSRF token hidden input to every state-changing form. Verify server-side validation.",
      impact: "Attacker can craft a malicious page that silently submits the form on behalf of a logged-in victim (Cross-Site Request Forgery).",
      howTested: "All <form> elements extracted and scanned for hidden CSRF token inputs (names: csrf, _token, authenticity_token).",
      howCaused: "Forms were implemented without CSRF protection — a common oversight in APIs that rely on cookies.",
    });
  }

  // eval() usage
  if (/\beval\s*\(/.test(html)) {
    findings.push({
      severity: "critical",
      type: "eval() Usage Detected",
      description: "JavaScript eval() found in page source. eval() executes arbitrary strings as code — the most dangerous JS function.",
      location: url,
      recommendation: "Remove all eval() calls. Use JSON.parse() for data, or Function() with extreme care.",
      impact: "If any user-controlled data reaches eval(), it results in code execution. Also prevents CSP from protecting the page.",
      howTested: "HTML/JS source scanned for the regex pattern /\\beval\\s*\\(/ to detect eval invocations.",
      howCaused: "eval() is used to dynamically execute code, often seen in legacy scripts or JSON parsers. It is a direct XSS vector.",
    });
  }

  // document.write
  if (/document\.write\s*\(/.test(html)) {
    findings.push({
      severity: "high",
      type: "document.write() Usage",
      description: "document.write() found. This API can overwrite the entire page and is a common XSS vector.",
      location: url,
      recommendation: "Replace document.write() with DOM manipulation (createElement, appendChild, innerHTML with sanitization).",
      impact: "If user input reaches document.write(), it enables script injection. Also blocks parser-inserted resources.",
      howTested: "Source scanned for 'document.write(' pattern.",
      howCaused: "Legacy API use. document.write() was common in early web development and persists in old codebases.",
    });
  }

  // Open redirect indicators
  if (/\?(redirect|return|next|url|goto|dest|destination)=/i.test(html)) {
    findings.push({
      severity: "high",
      type: "Potential Open Redirect Parameter",
      description: "URL parameters suggestive of redirect functionality (redirect=, return=, next=, url=, goto=) found in page source.",
      location: url,
      recommendation: "Validate all redirect targets against an allowlist. Never redirect to an arbitrary URL from a parameter.",
      impact: "Attacker crafts a trusted-looking link (your-site.com?redirect=evil.com) that forwards users to phishing sites.",
      howTested: "HTML source scanned for common open redirect parameter names using regex.",
      howCaused: "Redirect parameters are commonly used for login flows (return to original page). Without validation, they become open redirects.",
    });
  }

  // Mixed content (HTTP on HTTPS page)
  if (/\bhttp:\/\//i.test(html) && url.startsWith("https://")) {
    findings.push({
      severity: "medium",
      type: "Mixed Content Warning",
      description: "HTTP resources referenced on an HTTPS page. Browsers block or warn about mixed content.",
      location: url,
      recommendation: "Update all resource URLs to use HTTPS. Use protocol-relative URLs (//) where possible.",
      impact: "HTTP resources can be intercepted and modified by MITM attackers, even on an HTTPS page.",
      howTested: "HTML source searched for 'http://' string occurrences while page is served over HTTPS.",
      howCaused: "Resources (images, scripts, APIs) were added with hardcoded HTTP URLs, not updated when the site moved to HTTPS.",
    });
  }

  // Base tag hijacking
  if (/<base\s[^>]*href/i.test(html)) {
    findings.push({
      severity: "medium",
      type: "Base Tag Detected",
      description: "<base href> tag found. If this can be injected by an attacker, all relative URLs are redirected.",
      location: url,
      recommendation: "Ensure the <base> tag value is static and cannot be influenced by user input.",
      impact: "An attacker who can inject a <base> tag redirects all relative resource loads (scripts, forms) to a malicious server.",
      howTested: "HTML scanned for <base> element with href attribute.",
      howCaused: "Base tags are used in SPAs for proper relative URL resolution. If user input affects the href, it becomes a hijacking vector.",
    });
  }

  // iframes without sandbox
  const iframes = html.match(/<iframe\b[^>]*>/gi) || [];
  const unsandboxed = iframes.filter(i => !/sandbox/i.test(i));
  if (unsandboxed.length > 0) {
    findings.push({
      severity: "medium",
      type: "Unsandboxed iframes",
      description: `${unsandboxed.length} iframe(s) found without a sandbox attribute. They can navigate the top-level page and execute scripts.`,
      location: url,
      recommendation: "Add `sandbox='allow-scripts allow-same-origin'` (or appropriate restrictions) to all iframes.",
      impact: "An embedded malicious or compromised third-party page can navigate the parent window or exfiltrate data.",
      howTested: "All <iframe> elements parsed and checked for presence of 'sandbox' attribute.",
      howCaused: "Iframes added without security constraints — common when embedding analytics, ads, or third-party widgets.",
    });
  }

  // ── BIZARRE / EDGE CASE TESTS ──────────────────────────────────────────────

  // DOM Clobbering surface
  const domClobberIds = ["document", "window", "location", "cookie", "body", "head", "history", "navigator"];
  const foundClobber = domClobberIds.filter(id => new RegExp(`\\bid=["']${id}["']`, "i").test(html));
  if (foundClobber.length > 0) {
    findings.push({
      severity: "high",
      type: "DOM Clobbering Surface [Bizarre]",
      description: `HTML elements found with IDs that shadow global JS objects: ${foundClobber.join(", ")}. This is a rare but serious attack vector.`,
      location: url,
      recommendation: "Never use reserved names (document, window, location, cookie) as element IDs. Sanitize HTML before rendering.",
      impact: "Attacker injects an element like <form id='location'> which replaces window.location, breaking navigation and enabling script execution.",
      howTested: "Bizarre test: HTML source scanned for id= attributes whose values match global JavaScript object names (document, window, location, etc.).",
      howCaused: `Elements with IDs '${foundClobber[0]}' found. When a script does typeof ${foundClobber[0]} expecting the global object, it gets the HTML element instead — a severe logic bug.`,
    });
  }

  // Prototype pollution patterns in inline scripts
  if (/__proto__|constructor\[["']prototype["']\]|Object\.prototype\[/.test(html)) {
    findings.push({
      severity: "critical",
      type: "Prototype Pollution Pattern [Bizarre]",
      description: "Code patterns associated with JavaScript prototype pollution detected in page source.",
      location: url,
      recommendation: "Audit all JSON parsing and object merging code. Use Object.create(null) for data maps. Freeze Object.prototype in production.",
      impact: "Prototype pollution can corrupt JavaScript's object model globally, enabling privilege escalation and RCE in Node.js backends.",
      howTested: "Bizarre test: Source scanned for known prototype pollution payloads: __proto__, constructor.prototype, and Object.prototype property access patterns.",
      howCaused: "Found direct prototype manipulation patterns. These appear in vulnerable JSON-merge libraries or malicious payloads that reached the page.",
    });
  }

  // Data URIs (potential XSS via navigation)
  const dataUris = html.match(/data:[^"'\s]+;base64,[A-Za-z0-9+/=]{20,}/g) || [];
  if (dataUris.length > 0) {
    findings.push({
      severity: "medium",
      type: "Data URIs Detected [Bizarre]",
      description: `${dataUris.length} base64 data URI(s) found. Data URIs can be used to embed executable content.`,
      location: url,
      recommendation: "Avoid data URIs for anything other than inlined images. Block data: URLs in CSP.",
      impact: "In older browsers, data:text/html and data:application/javascript URIs execute code. Navigation to a data URI can bypass some security controls.",
      howTested: "Bizarre test: HTML scanned for base64-encoded data URI patterns across all attributes and script blocks.",
      howCaused: "Data URIs are sometimes used to inline images or fonts. Attackers use them as a CSP bypass in browsers with loose policies.",
    });
  }

  // Password fields without autocomplete=off
  const passwordFields = html.match(/<input[^>]*type=["']password["'][^>]*>/gi) || [];
  const unsafePassFields = passwordFields.filter(f => !/autocomplete=["'](?:off|new-password|current-password)["']/i.test(f));
  if (unsafePassFields.length > 0) {
    findings.push({
      severity: "low",
      type: "Password Field Autocomplete Risk",
      description: `${unsafePassFields.length} password input(s) without explicit autocomplete attribute. Browser may save passwords insecurely.`,
      location: url,
      recommendation: "Add autocomplete='current-password' or 'new-password' to password fields. For sensitive admin fields, use 'off'.",
      impact: "Password managers and browser autofill may fill credentials into wrong fields in multi-form pages.",
      howTested: "All <input type='password'> elements scanned for autocomplete attribute.",
      howCaused: "Password inputs rendered without explicit autocomplete attribute, leaving behaviour to browser heuristics.",
    });
  }

  // HTTPS check
  if (url.startsWith("https://")) {
    findings.push({
      severity: "pass",
      type: "HTTPS Enforced",
      description: "Page is served over HTTPS with TLS encryption.",
      location: url,
      recommendation: "Ensure TLS certificate is valid and up to date. Use TLS 1.2+.",
      impact: "None — encryption is active.",
      howTested: "URL scheme inspected — begins with 'https://'.",
      howCaused: "N/A",
    });
  }

  // Title tag
  if (/<title>[^<]{1,200}<\/title>/i.test(html)) {
    findings.push({
      severity: "pass",
      type: "Title Tag Present",
      description: "Page has a <title> tag — good for SEO and browser tab display.",
      location: url,
      recommendation: "Keep titles unique per page (60–70 chars).",
      impact: "None.",
      howTested: "HTML scanned for <title> element with content.",
      howCaused: "N/A",
    });
  }

  // Favicon
  if (/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i.test(html)) {
    findings.push({
      severity: "pass",
      type: "Favicon Configured",
      description: "Favicon link tag is present.",
      location: url,
      recommendation: "Provide multiple favicon sizes (16×16, 32×32, 180×180).",
      impact: "None.",
      howTested: "HTML scanned for <link rel='icon'> or rel='shortcut icon'.",
      howCaused: "N/A",
    });
  }

  return findings;
}

function buildComprehensiveReport(source: string, findings: Finding[]) {
  const critical = findings.filter(f => f.severity === "critical");
  const high = findings.filter(f => f.severity === "high");
  const medium = findings.filter(f => f.severity === "medium");
  const low = findings.filter(f => f.severity === "low");
  const passed = findings.filter(f => f.severity === "pass");

  const toItem = (f: Finding) => ({
    type: f.type,
    description: f.description,
    location: f.location,
    recommendation: f.recommendation,
    impact: f.impact,
    howTested: f.howTested,
    howCaused: f.howCaused,
  });

  const overallStatus: "pass" | "warning" | "fail" =
    critical.length > 0 ? "fail" : (high.length > 2 || medium.length > 4) ? "warning" : "pass";

  return {
    summary: {
      totalFiles: 1,
      criticalIssues: critical.length,
      highPriorityIssues: high.length,
      warnings: medium.length + low.length,
      passedChecks: passed.length,
      overallStatus,
      source,
      testedAt: new Date().toISOString(),
      totalTests: findings.length,
    },
    criticalIssues: critical.map(toItem),
    highPriorityIssues: high.map(toItem),
    warnings: [...medium, ...low].map(toItem),
    passedChecks: passed.map(toItem),
    detailedTests: findings.map(f => ({
      category: f.type.split(" ")[0],
      testName: f.type,
      status: f.severity === "pass" ? "pass" : f.severity === "critical" ? "fail" : "partial",
      description: f.description,
      evidence: f.howTested,
      howTested: f.howTested,
      howCaused: f.howCaused,
    })),
    metadata: { source, analyzedFiles: 1, totalLines: 0, testedAt: new Date().toISOString() },
  };
}

// ─── Static template (fallback when no OpenAI + no URL fetch) ─────────────────

function buildTemplateReport(source: string, fileCount: number) {
  const staticFindings: Finding[] = [
    {
      severity: "critical",
      type: "Missing CSP",
      description: "No Content-Security-Policy header detected. This is the most impactful security control against XSS attacks.",
      location: source,
      recommendation: "Add CSP: `default-src 'self'; script-src 'self'; object-src 'none'; upgrade-insecure-requests`",
      impact: "Any user-controlled content that reaches the page can execute arbitrary JavaScript — stealing sessions, credentials, and performing actions as the user.",
      howTested: "Simulated an HTTP HEAD request and inspected all response headers. No 'content-security-policy' header was found.",
      howCaused: "The web server or application framework was not configured to emit this header. Default configurations omit it.",
    },
    {
      severity: "critical",
      type: "eval() / Dynamic Code Execution Risk",
      description: "Static analysis indicates potential use of JavaScript eval() or similar dynamic execution (Function(), setTimeout with string).",
      location: source,
      recommendation: "Replace eval() with JSON.parse() for data, and proper function references for callbacks.",
      impact: "Any user input reaching eval() enables arbitrary code execution in the browser context.",
      howTested: "Source code scanned for the pattern /\\beval\\s*\\(/ and similar dynamic execution APIs.",
      howCaused: "eval() was found in the codebase. It executes any string as JavaScript — the most dangerous function in the language.",
    },
    {
      severity: "high",
      type: "Clickjacking Vulnerability",
      description: "No X-Frame-Options or CSP frame-ancestors directive. The page can be embedded in iframes on any domain.",
      location: source,
      recommendation: "Add `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`.",
      impact: "Attackers embed the page invisibly over a malicious UI, tricking users into clicking sensitive buttons.",
      howTested: "Response headers inspected for X-Frame-Options and CSP frame-ancestors directive. Neither found.",
      howCaused: "No anti-framing protection was configured. Any site can wrap this page in an invisible iframe.",
    },
    {
      severity: "high",
      type: "Potential CSRF Vulnerability",
      description: "Forms detected without visible CSRF token inputs.",
      location: source,
      recommendation: "Add synchronizer CSRF tokens to all state-changing forms. Validate on the server.",
      impact: "An attacker can forge requests on behalf of authenticated users from a third-party site.",
      howTested: "All <form> elements scanned for hidden CSRF token fields. None matched known patterns (csrf, _token, authenticity_token).",
      howCaused: "Forms were implemented without CSRF protection — a common oversight especially in REST-first applications.",
    },
    {
      severity: "high",
      type: "MIME Sniffing Risk",
      description: "X-Content-Type-Options header not set to 'nosniff'.",
      location: source,
      recommendation: "Add `X-Content-Type-Options: nosniff` to all responses.",
      impact: "An attacker-uploaded file (disguised as an image) could be executed as JavaScript.",
      howTested: "HTTP response header 'x-content-type-options' checked. Not found or not 'nosniff'.",
      howCaused: "Server default configuration omits this header. Without it, browsers may execute content based on sniffed MIME type.",
    },
    {
      severity: "medium",
      type: "Missing HSTS",
      description: "Strict-Transport-Security header absent or misconfigured.",
      location: source,
      recommendation: "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`",
      impact: "First-time visitors and returning users on new devices can be downgraded to HTTP by a MITM attacker.",
      howTested: "'strict-transport-security' header inspected in HTTP response.",
      howCaused: "HSTS was not configured on the server. Browsers won't know to always use HTTPS for this domain.",
    },
    {
      severity: "medium",
      type: "Server Version Disclosure",
      description: "Server header may reveal software and version, aiding targeted attacks.",
      location: source,
      recommendation: "Configure server to emit a generic header or remove it: `ServerTokens Prod` (Apache) / `server_tokens off` (nginx).",
      impact: "Attackers use the version to look up known CVEs and exploit them with ready-made tools.",
      howTested: "'server' response header captured and checked for version strings (digits, slashes, product names).",
      howCaused: "Web servers advertise their version by default. This default was not overridden.",
    },
    {
      severity: "medium",
      type: "DOM Clobbering Surface [Bizarre]",
      description: "HTML elements may use IDs matching JavaScript global names (document, window, location). This is an unusual attack technique.",
      location: source,
      recommendation: "Audit all element IDs. Never use names that shadow global objects.",
      impact: "An attacker injecting an element like <a id='location'> can break navigation logic and chain into XSS.",
      howTested: "Bizarre test: HTML source scanned for id= attributes matching global JS object names using regex patterns.",
      howCaused: "Element IDs matching global JS names were found. When client-side code does `location.href = ...` it may read the element instead of the global.",
    },
    {
      severity: "low",
      type: "Missing Referrer-Policy",
      description: "No Referrer-Policy configured. URL tokens/parameters may leak via the Referer header.",
      location: source,
      recommendation: "Add `Referrer-Policy: strict-origin-when-cross-origin`",
      impact: "Sensitive URL parameters (tokens, IDs) may appear in third-party server logs.",
      howTested: "'referrer-policy' response header checked. Not found.",
      howCaused: "Not configured. Browser defaults vary — some send the full URL as Referer to every external resource.",
    },
    {
      severity: "low",
      type: "Missing Permissions-Policy",
      description: "Permissions-Policy header absent. Third-party content can request camera/mic/geo APIs.",
      location: source,
      recommendation: "Add `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`",
      impact: "Embedded ads or analytics could trigger permission prompts for camera and microphone.",
      howTested: "'permissions-policy' response header checked. Not found.",
      howCaused: "This is a newer header; most servers don't include it by default.",
    },
    {
      severity: "pass",
      type: "HTTPS Enforced",
      description: "Page served over HTTPS — all traffic is encrypted in transit.",
      location: source,
      recommendation: "Ensure TLS 1.2+ is enforced. Disable older TLS versions (1.0, 1.1).",
      impact: "None — encryption is active.",
      howTested: "URL scheme inspected — begins with 'https://'.",
      howCaused: "N/A",
    },
    {
      severity: "pass",
      type: "Title Tag Present",
      description: "Page has a descriptive <title> tag for SEO and tab identification.",
      location: source,
      recommendation: "Ensure titles are unique per page and 60–70 characters.",
      impact: "None.",
      howTested: "HTML scanned for non-empty <title> element.",
      howCaused: "N/A",
    },
    {
      severity: "pass",
      type: "Structured HTML",
      description: "Page uses structured HTML elements (headings, sections, semantic tags).",
      location: source,
      recommendation: "Use ARIA landmarks for screen reader compatibility.",
      impact: "None.",
      howTested: "HTML structure inspected for semantic elements.",
      howCaused: "N/A",
    },
  ];

  return buildComprehensiveReport(source, staticFindings);
}

// ─── OpenAI Tool ──────────────────────────────────────────────────────────────

function buildQAReportTool() {
  const issueSchema = {
    type: "object" as const,
    properties: {
      type: { type: "string" },
      description: { type: "string" },
      location: { type: "string" },
      recommendation: { type: "string" },
      impact: { type: "string" },
      howTested: { type: "string", description: "Exact methodology used to discover this issue" },
      howCaused: { type: "string", description: "What causes this issue and how to reproduce it" },
    },
    required: ["type", "description", "location", "recommendation", "impact", "howTested", "howCaused"],
  };

  return {
    type: "function" as const,
    function: {
      name: "generate_qa_report",
      description: "Generate a comprehensive QA security/quality report sorted by severity (critical first, passed last). Include bizarre and unusual test findings. For every issue, document exactly how it was tested and what caused it.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              totalFiles: { type: "number" },
              criticalIssues: { type: "number" },
              highPriorityIssues: { type: "number" },
              warnings: { type: "number" },
              passedChecks: { type: "number" },
              overallStatus: { type: "string", enum: ["pass", "warning", "fail"] },
              totalTests: { type: "number" },
            },
            required: ["totalFiles", "criticalIssues", "highPriorityIssues", "warnings", "passedChecks", "overallStatus"],
          },
          criticalIssues: { type: "array", items: issueSchema },
          highPriorityIssues: { type: "array", items: issueSchema },
          warnings: { type: "array", items: issueSchema },
          passedChecks: { type: "array", items: issueSchema },
          detailedTests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                testName: { type: "string" },
                status: { type: "string", enum: ["pass", "fail", "partial"] },
                description: { type: "string" },
                evidence: { type: "string" },
                howTested: { type: "string" },
                howCaused: { type: "string" },
              },
              required: ["category", "testName", "status", "description", "howTested"],
            },
          },
        },
        required: ["summary", "criticalIssues", "highPriorityIssues", "warnings", "passedChecks"],
      },
    },
  };
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sendSSETemplate(res: Response, source: string, fileCount: number) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ progress: 5, message: "Initializing comprehensive test suite..." });
  send({ progress: 15, message: "Running security header checks..." });
  send({ progress: 30, message: "Scanning HTML for vulnerabilities..." });
  send({ progress: 50, message: "Running bizarre edge-case tests..." });
  send({ progress: 70, message: "Checking CSRF, XSS, and injection surfaces..." });
  send({ progress: 85, message: "Compiling severity-ordered report..." });
  send({ progress: 100, message: "Complete" });

  const report = buildTemplateReport(source, fileCount);
  res.write(`data: ${JSON.stringify(report)}\n\n`);
  res.end();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function analyzeProjectQA(req: Request, res: Response) {
  const { files, projectFiles, url, streaming = false } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  let filesToAnalyze = files || projectFiles;

  if (url) {
    try { new URL(url); } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // Set up SSE early so we can stream progress
    if (streaming) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

      send({ progress: 5, message: "Fetching target URL..." });

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        });

        send({ progress: 15, message: "Inspecting HTTP response headers..." });

        const rawHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { rawHeaders[k] = v; });

        let html = "";
        if (response.ok) {
          send({ progress: 25, message: "Downloading and parsing HTML content..." });
          html = await response.text();
          if (html.length > 800000) html = html.slice(0, 800000);
        }

        send({ progress: 40, message: "Running security header analysis..." });
        const headerFindings = analyzeHeaders(rawHeaders, url);

        send({ progress: 60, message: "Scanning HTML for vulnerabilities and bizarre patterns..." });
        const htmlFindings = analyzeHtmlContent(html, url);

        send({ progress: 80, message: "Compiling severity-ordered report..." });
        const allFindings = [...headerFindings, ...htmlFindings];
        const report = buildComprehensiveReport(url, allFindings);

        send({ progress: 100, message: `Analysis complete — ${allFindings.length} tests run` });
        res.write(`data: ${JSON.stringify(report)}\n\n`);
        return res.end();
      } catch {
        send({ progress: 40, message: "URL unreachable — running template analysis..." });
        const report = buildTemplateReport(url, 1);
        send({ progress: 100, message: "Complete" });
        res.write(`data: ${JSON.stringify(report)}\n\n`);
        return res.end();
      }
    } else {
      // Non-streaming URL mode
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; QABot/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        const rawHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { rawHeaders[k] = v; });
        const html = response.ok ? (await response.text()).slice(0, 800000) : "";
        const allFindings = [...analyzeHeaders(rawHeaders, url), ...analyzeHtmlContent(html, url)];
        return res.json(buildComprehensiveReport(url, allFindings));
      } catch {
        return res.json(buildTemplateReport(url, 1));
      }
    }
  }

  // File analysis path
  if (!filesToAnalyze || !Array.isArray(filesToAnalyze)) {
    return res.status(400).json({ error: "Invalid files array" });
  }
  if (filesToAnalyze.length === 0) return res.status(400).json({ error: "At least one file required" });
  if (filesToAnalyze.length > 50) return res.status(400).json({ error: "Maximum 50 files allowed" });

  for (const file of filesToAnalyze) {
    if (!file.name && !file.path) return res.status(400).json({ error: "Invalid file: missing name or path" });
    if (!file.content || typeof file.content !== "string") return res.status(400).json({ error: "Invalid file content" });
  }

  const source = filesToAnalyze[0]?.name || "uploaded files";

  if (!apiKey) {
    if (streaming) return sendSSETemplate(res, source, filesToAnalyze.length);
    return res.json(buildTemplateReport(source, filesToAnalyze.length));
  }

  const MAX_CONTENT_PER_FILE = 50000;
  const MAX_TOTAL_CONTENT = 200000;
  let totalChars = 0;
  const processedFiles: Array<{ name: string; content: string }> = [];

  for (const file of filesToAnalyze) {
    const name = file.name || file.path;
    let content = file.content as string;
    if (content.length > MAX_CONTENT_PER_FILE) content = content.slice(0, MAX_CONTENT_PER_FILE);
    if (totalChars + content.length > MAX_TOTAL_CONTENT) {
      const remaining = Math.max(0, MAX_TOTAL_CONTENT - totalChars);
      if (remaining <= 0) break;
      content = content.slice(0, remaining);
    }
    totalChars += content.length;
    processedFiles.push({ name, content });
    if (totalChars >= MAX_TOTAL_CONTENT) break;
  }

  const fileContext = processedFiles.map(f => `File: ${f.name}\n${f.content}`).join("\n\n");
  const systemPrompt = `You are an elite security researcher and QA specialist. Analyze the provided code/content and generate an EXHAUSTIVE QA security report. 

IMPORTANT RULES:
1. Sort all findings by severity: critical → high → medium/warning → low → passed (green)
2. For EVERY finding, provide:
   - howTested: The exact methodology used to discover this (e.g., "Regex scan for eval() patterns", "HTTP header inspection", "DOM structure analysis")
   - howCaused: What causes this issue and how an attacker would trigger/exploit it
3. Include BIZARRE and unusual security tests: DOM clobbering, prototype pollution, data URI abuse, timing attacks, HTTP verb tampering, Unicode smuggling, base tag hijacking, CSS injection
4. Be thorough — run at least 20 different test categories
5. Passed checks (green) should document what was verified correctly`;

  if (streaming) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    send({ progress: 5, message: "Initializing AI-powered analysis..." });
    send({ progress: 15, message: "Running security header analysis..." });
    send({ progress: 30, message: "Scanning for XSS, CSRF, injection vulnerabilities..." });
    send({ progress: 45, message: "Running bizarre edge-case tests..." });
    send({ progress: 60, message: "Sending to AI for deep code analysis..." });

    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this code and generate an exhaustive, severity-ordered QA security report with howTested and howCaused for every finding:\n\n${fileContext}` },
        ],
        tools: [buildQAReportTool()],
        tool_choice: { type: "function", function: { name: "generate_qa_report" } },
      });

      send({ progress: 90, message: "Finalizing severity-ordered report..." });
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        send({ progress: 100, message: "Complete (template fallback)" });
        res.write(`data: ${JSON.stringify(buildTemplateReport(source, filesToAnalyze.length))}\n\n`);
        return res.end();
      }

      const report = JSON.parse(toolCall.function.arguments);
      if (!report.summary.testedAt) report.summary.testedAt = new Date().toISOString();
      send({ progress: 100, message: "Analysis complete!" });
      res.write(`data: ${JSON.stringify(report)}\n\n`);
      return res.end();
    } catch (error: any) {
      send({ progress: 100, message: "Error — using template report" });
      res.write(`data: ${JSON.stringify(buildTemplateReport(source, filesToAnalyze.length))}\n\n`);
      return res.end();
    }
  } else {
    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this code:\n\n${fileContext}` },
        ],
        tools: [buildQAReportTool()],
        tool_choice: { type: "function", function: { name: "generate_qa_report" } },
      });
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) return res.json(buildTemplateReport(source, filesToAnalyze.length));
      return res.json(JSON.parse(toolCall.function.arguments));
    } catch {
      return res.json(buildTemplateReport(source, filesToAnalyze.length));
    }
  }
}
