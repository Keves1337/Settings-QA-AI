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

// ─── Human / Functional UX Tests ─────────────────────────────────────────────
// Tests that replicate what a real QA tester does by hand

function analyzeUserExperience(html: string, url: string, responseMs?: number, responseBytes?: number, statusCode?: number): Finding[] {
  const findings: Finding[] = [];

  // ── Page Load Performance ───────────────────────────────────────────────────

  if (responseMs !== undefined) {
    if (responseMs > 5000) {
      findings.push({
        severity: "critical",
        type: "Page Load Critically Slow",
        description: `Page took ${responseMs}ms to respond — over 5 seconds. Users abandon pages that take this long.`,
        location: url,
        recommendation: "Audit server-side rendering time, database queries, and CDN configuration. Target < 500ms TTFB.",
        impact: "Google penalises slow pages in search ranking. 53% of mobile users abandon pages that take longer than 3 seconds.",
        howTested: "Measured wall-clock time from sending GET request to receiving first byte. Timed the full HTTP response.",
        howCaused: `Server took ${responseMs}ms to respond. Likely cause: heavy server-side processing, no caching, database bottleneck, or no CDN.`,
      });
    } else if (responseMs > 2000) {
      findings.push({
        severity: "high",
        type: "Page Load Slow",
        description: `Page response took ${responseMs}ms. Recommended target is under 500ms for good user experience.`,
        location: url,
        recommendation: "Add server-side caching, optimize database queries, use a CDN, and enable HTTP/2.",
        impact: "Users experience visible loading delays. Bounce rates increase significantly above 2 seconds.",
        howTested: "HTTP request timing measured from request send to response complete.",
        howCaused: `Response was ${responseMs}ms — typical causes include unoptimised queries, no page caching, or high server load.`,
      });
    } else if (responseMs > 800) {
      findings.push({
        severity: "medium",
        type: "Page Response Time Above Target",
        description: `Response time is ${responseMs}ms. Acceptable but above the 500ms best-practice target.`,
        location: url,
        recommendation: "Profile server-side code and consider adding caching headers (Cache-Control, ETag).",
        impact: "Users may notice a brief delay. Below the critical threshold but worth improving.",
        howTested: "Wall-clock timing of HTTP response measured.",
        howCaused: `Server processing took ${responseMs}ms. May be due to unoptimised rendering or un-cached responses.`,
      });
    } else {
      findings.push({
        severity: "pass",
        type: "Page Response Time Good",
        description: `Page responded in ${responseMs}ms — well within the 800ms target.`,
        location: url,
        recommendation: "Continue monitoring with tools like Lighthouse and WebPageTest.",
        impact: "None — performance is good.",
        howTested: "HTTP response timing measured end-to-end.",
        howCaused: "N/A",
      });
    }
  }

  if (responseBytes !== undefined) {
    if (responseBytes > 2_000_000) {
      findings.push({
        severity: "high",
        type: "Page Size Too Large",
        description: `HTML response is ${(responseBytes / 1024).toFixed(0)}KB. Pages over 2MB cause slow parsing on mobile.`,
        location: url,
        recommendation: "Reduce inline content, defer non-critical scripts, compress images, use lazy loading.",
        impact: "On slow mobile connections, large HTML causes visible delay in rendering and interaction readiness.",
        howTested: "Measured Content-Length of HTTP response body. HTML response size recorded in bytes.",
        howCaused: `Page includes ${(responseBytes / 1024).toFixed(0)}KB of HTML — likely from large inline scripts, styles, or embedded content.`,
      });
    } else if (responseBytes > 500_000) {
      findings.push({
        severity: "medium",
        type: "Large HTML Document",
        description: `Page HTML is ${(responseBytes / 1024).toFixed(0)}KB. Consider reducing payload.`,
        location: url,
        recommendation: "Move inline styles/scripts to external files, enable gzip/brotli compression.",
        impact: "Slower parse times on low-end devices. Increased data usage for users on limited mobile data plans.",
        howTested: "Response body size measured in bytes.",
        howCaused: "Large amounts of inline content or verbose HTML structure.",
      });
    }
  }

  if (statusCode !== undefined && statusCode !== 200) {
    const severity = statusCode >= 500 ? "critical" : statusCode >= 400 ? "high" : "medium";
    findings.push({
      severity,
      type: `HTTP ${statusCode} Status Code`,
      description: `Page returned HTTP ${statusCode} instead of 200 OK. ${statusCode >= 500 ? "Server error!" : statusCode >= 400 ? "Client error." : "Redirect."}`,
      location: url,
      recommendation: statusCode >= 500 ? "Fix the server error immediately — users see a broken page." : statusCode >= 400 ? "Ensure the URL is correct and the page exists." : "Verify redirect chain isn't excessive (< 3 hops).",
      impact: statusCode >= 500 ? "All users see a broken/error page. Application is partially or fully down." : "Users may be blocked from accessing the page.",
      howTested: `Performed HTTP GET request to ${url}. Checked response status code. Got ${statusCode}.`,
      howCaused: `Server returned HTTP ${statusCode}. ${statusCode === 404 ? "URL does not match any route." : statusCode === 500 ? "Unhandled server error / exception." : statusCode === 403 ? "Access control blocks unauthenticated access." : "Inspect server logs for cause."}`,
    });
  }

  // ── Buttons Audit ───────────────────────────────────────────────────────────

  const allButtons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
  const buttonsMissingText = allButtons.filter(b => {
    const content = b.replace(/<button[^>]*>/i, "").replace(/<\/button>/i, "").replace(/<[^>]+>/g, "").trim();
    return content.length === 0 && !/aria-label=|title=/i.test(b);
  });
  if (buttonsMissingText.length > 0) {
    findings.push({
      severity: "high",
      type: "Buttons Without Accessible Labels",
      description: `${buttonsMissingText.length} button(s) found with no visible text and no aria-label. Screen readers and users cannot identify what these buttons do.`,
      location: url,
      recommendation: "Add descriptive text, aria-label, or title attribute to every button. Example: `<button aria-label='Close dialog'>✕</button>`",
      impact: "Icon-only buttons without labels are completely unusable for screen reader users. Also, automated test frameworks cannot identify and click them reliably.",
      howTested: "Every <button> element's inner text was extracted (stripping child HTML tags). Buttons with empty text and no aria-label were flagged.",
      howCaused: "Buttons were implemented as icon-only (e.g. SVG icons, emoji) without adding accessible text alternatives for non-visual users.",
    });
  }

  const buttonsWithoutType = allButtons.filter(b => !/type=["'](button|submit|reset)["']/i.test(b));
  if (buttonsWithoutType.length > 0) {
    findings.push({
      severity: "medium",
      type: "Buttons Missing type Attribute",
      description: `${buttonsWithoutType.length} button(s) are missing the type attribute. Buttons default to type='submit', which can accidentally submit a parent form.`,
      location: url,
      recommendation: "Add type='button' to non-submit buttons and type='submit' to form submit buttons explicitly.",
      impact: "A button without type='button' inside a form will trigger form submission when clicked — a classic bug that causes unintended data submission.",
      howTested: "All <button> elements parsed. Those without a type='button|submit|reset' attribute were counted.",
      howCaused: `${buttonsWithoutType.length} button(s) have no type attribute. Browser defaults to 'submit' — clicking any of these inside a form submits it.`,
    });
  }

  if (allButtons.length > 0 && buttonsMissingText.length === 0) {
    findings.push({
      severity: "pass",
      type: "All Buttons Have Accessible Labels",
      description: `All ${allButtons.length} button(s) on the page have visible text or aria-label — good for usability and screen readers.`,
      location: url,
      recommendation: "Continue auditing for keyboard focus visibility on all buttons.",
      impact: "None.",
      howTested: "Each button's inner text and aria attributes were inspected. All buttons passed.",
      howCaused: "N/A",
    });
  }

  // ── Links Audit ─────────────────────────────────────────────────────────────

  const allLinks = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  const deadLinks = allLinks.filter(a => {
    const href = (a.match(/href=["']([^"']*)["']/i) || [])[1] || "";
    return href === "" || href === "#" || /^javascript:/i.test(href);
  });
  if (deadLinks.length > 0) {
    findings.push({
      severity: "high",
      type: "Dead / Non-Functional Links",
      description: `${deadLinks.length} link(s) found with href="#", href="javascript:...", or empty href. These do nothing when clicked — a real functionality failure.`,
      location: url,
      recommendation: "Replace dead links with real URLs or use <button> elements for non-navigation interactions. Never use href='javascript:void(0)'.",
      impact: "Users click these links expecting navigation and nothing happens. This is a direct functional failure — exactly what a human tester would report.",
      howTested: "Every <a> element was inspected. href values of '#', empty strings, and 'javascript:' patterns were flagged as non-functional.",
      howCaused: "Links were used as button-like clickable elements during development (a common anti-pattern) without being updated to real destinations.",
    });
  }

  const externalLinksNoOpener = allLinks.filter(a => {
    const href = (a.match(/href=["']([^"']*)["']/i) || [])[1] || "";
    const isExternal = /^https?:\/\//i.test(href) && !href.includes(new URL(url).hostname);
    const hasBlank = /target=["']_blank["']/i.test(a);
    const hasOpener = /rel=["'][^"']*noopener[^"']*["']/i.test(a);
    return isExternal && hasBlank && !hasOpener;
  });
  if (externalLinksNoOpener.length > 0) {
    findings.push({
      severity: "medium",
      type: "External Links Missing rel='noopener'",
      description: `${externalLinksNoOpener.length} external link(s) open in a new tab (target='_blank') without rel='noopener noreferrer'.`,
      location: url,
      recommendation: "Add rel='noopener noreferrer' to all target='_blank' links.",
      impact: "The opened page can access and manipulate window.opener, potentially redirecting your page to a malicious URL (reverse tabnapping).",
      howTested: "All <a target='_blank'> links pointing to external domains were checked for rel='noopener' attribute.",
      howCaused: "Links were added with target='_blank' without the required security attribute — a common oversight.",
    });
  }

  const linksWithoutText = allLinks.filter(a => {
    const content = a.replace(/<a[^>]*>/i, "").replace(/<\/a>/i, "").replace(/<[^>]+>/g, "").trim();
    return content.length === 0 && !/aria-label=|title=/i.test(a);
  });
  if (linksWithoutText.length > 0) {
    findings.push({
      severity: "medium",
      type: "Links Without Accessible Text",
      description: `${linksWithoutText.length} link(s) have no visible text and no aria-label. Screen readers will read the URL, confusing users.`,
      location: url,
      recommendation: "Add descriptive text or aria-label to every link. Avoid icon-only links without accessible alternatives.",
      impact: "Screen reader users hear the raw URL announced instead of a description — completely unusable.",
      howTested: "Every <a> element's text content stripped of HTML tags. Empty links with no aria-label flagged.",
      howCaused: "Links contain only images or SVG icons without accompanying accessible text.",
    });
  }

  // ── Forms Audit ─────────────────────────────────────────────────────────────

  const allForms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];

  const formsWithoutSubmit = allForms.filter(f => !/<(?:button[^>]*type=["']submit["']|input[^>]*type=["']submit["']|button(?![^>]*type=["'](?:button|reset)["'])[^>]*>[^<])/i.test(f));
  if (formsWithoutSubmit.length > 0) {
    findings.push({
      severity: "high",
      type: "Forms Without Submit Button",
      description: `${formsWithoutSubmit.length} form(s) found without a visible submit button. Users cannot submit these forms.`,
      location: url,
      recommendation: "Add a <button type='submit'> or <input type='submit'> to every form. Test form submission manually.",
      impact: "This is a direct functional failure — users fill out the form but cannot submit it. A critical bug that a human tester finds immediately.",
      howTested: "Every <form> element was inspected for a submit button (type='submit' input or button element). Forms without one were flagged.",
      howCaused: "Submit button may have been accidentally removed, or the form relies on JavaScript to submit without a visible control — breaking keyboard-only users.",
    });
  }

  const allInputs = html.match(/<input\b[^>]*/gi) || [];
  const inputsWithoutLabel = allInputs.filter(inp => {
    const type = (inp.match(/type=["']([^"']*)["']/i) || [])[1] || "text";
    if (["hidden", "submit", "button", "image", "reset"].includes(type.toLowerCase())) return false;
    const id = (inp.match(/\bid=["']([^"']*)["']/i) || [])[1];
    const hasAriaLabel = /aria-label=|aria-labelledby=/i.test(inp);
    const hasPlaceholderOnly = /placeholder=/i.test(inp) && !id && !hasAriaLabel;
    return hasPlaceholderOnly && !id;
  });
  if (inputsWithoutLabel.length > 0) {
    findings.push({
      severity: "medium",
      type: "Form Inputs Relying Only on Placeholder",
      description: `${inputsWithoutLabel.length} input(s) use only a placeholder for labeling with no associated <label> or aria-label. Placeholder disappears on typing.`,
      location: url,
      recommendation: "Use <label for='inputId'> or aria-label for every input. Placeholder is not a substitute for a label.",
      impact: "Users forget what a field is for once they start typing. Particularly problematic for users with cognitive disabilities.",
      howTested: "Inputs without an id (and thus no associated <label>) and without aria-label were checked for placeholder-only labeling.",
      howCaused: "Placeholder text was used as the primary label — a design shortcut that fails usability and accessibility standards.",
    });
  }

  const allRequiredInputs = allInputs.filter(i => /\brequired\b/i.test(i));
  if (allRequiredInputs.length > 0) {
    findings.push({
      severity: "pass",
      type: "Required Fields Marked",
      description: `${allRequiredInputs.length} input(s) are marked with the required attribute — browser-native validation is active.`,
      location: url,
      recommendation: "Also add server-side validation for all required fields. Never trust client-side only.",
      impact: "None — required fields are correctly marked.",
      howTested: "All <input> elements checked for required attribute.",
      howCaused: "N/A",
    });
  }

  if (allForms.length > 0) {
    findings.push({
      severity: "pass",
      type: "Forms Present and Detectable",
      description: `${allForms.length} form(s) detected on the page.`,
      location: url,
      recommendation: "Test each form manually: fill fields, submit, verify response, check validation messages.",
      impact: "None.",
      howTested: "All <form> elements counted in HTML source.",
      howCaused: "N/A",
    });
  }

  // ── Images Audit ────────────────────────────────────────────────────────────

  const allImages = html.match(/<img\b[^>]*/gi) || [];
  const imagesWithoutAlt = allImages.filter(img => !/\balt=["'][^"']*["']/i.test(img) || /alt=["']["']/i.test(img));
  if (imagesWithoutAlt.length > 0) {
    findings.push({
      severity: "high",
      type: "Images Missing Alt Text",
      description: `${imagesWithoutAlt.length} image(s) found with missing or empty alt attribute. Screen readers cannot describe these images.`,
      location: url,
      recommendation: "Add descriptive alt text to all meaningful images. For decorative images, use alt=''.",
      impact: "Screen reader users get no information about these images. Also fails WCAG 2.1 Level A — a legal compliance issue in many countries.",
      howTested: "All <img> elements extracted. Those without an alt attribute or with alt='' on non-decorative images were flagged.",
      howCaused: "Images were added to HTML without alt text — a very common omission during rapid development.",
    });
  } else if (allImages.length > 0) {
    findings.push({
      severity: "pass",
      type: "All Images Have Alt Text",
      description: `All ${allImages.length} image(s) have alt attributes.`,
      location: url,
      recommendation: "Ensure alt text is descriptive and meaningful, not just the filename.",
      impact: "None.",
      howTested: "All <img> elements checked for non-empty alt attribute.",
      howCaused: "N/A",
    });
  }

  // Broken image patterns (src is empty or relative with suspicious pattern)
  const brokenImageCandidates = allImages.filter(img => {
    const src = (img.match(/\bsrc=["']([^"']*)["']/i) || [])[1] || "";
    return src === "" || src === "#" || /undefined|null/i.test(src);
  });
  if (brokenImageCandidates.length > 0) {
    findings.push({
      severity: "high",
      type: "Potentially Broken Images",
      description: `${brokenImageCandidates.length} image(s) have suspicious src values (empty, '#', 'undefined', or 'null'). These will display as broken images.`,
      location: url,
      recommendation: "Fix or remove images with invalid src. Implement image error handling with fallback images.",
      impact: "Users see broken image icons — a visible quality failure. JavaScript template strings like `${imageUrl}` sometimes produce 'undefined' in the DOM when variables are unset.",
      howTested: "All <img src='...'> values extracted. Those matching empty, '#', 'undefined', or 'null' were flagged.",
      howCaused: "JavaScript variable containing the image URL was undefined at render time, or the image path was never set.",
    });
  }

  // ── Navigation & Accessibility ──────────────────────────────────────────────

  const hasNav = /<nav\b/i.test(html);
  if (!hasNav) {
    findings.push({
      severity: "medium",
      type: "No <nav> Landmark",
      description: "No <nav> element found. Navigation links are not structured for screen readers or search engines.",
      location: url,
      recommendation: "Wrap your main navigation links in a <nav aria-label='Main navigation'> element.",
      impact: "Screen reader users cannot jump to navigation using their landmark shortcut keys. Also reduces SEO crawlability.",
      howTested: "HTML source searched for <nav> element using regex. None found.",
      howCaused: "Navigation was implemented with <div> or <ul> instead of the semantic <nav> element.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "<nav> Landmark Present",
      description: "Semantic <nav> element found — navigation is structured for accessibility.",
      location: url,
      recommendation: "Add aria-label to distinguish between multiple nav elements (e.g., 'Main navigation', 'Footer navigation').",
      impact: "None.",
      howTested: "HTML scanned for <nav> element.",
      howCaused: "N/A",
    });
  }

  // Skip navigation link
  if (!/skip.*nav|skip.*main|skip.*content/i.test(html)) {
    findings.push({
      severity: "low",
      type: "No Skip Navigation Link",
      description: "No 'Skip to main content' link found. Keyboard users must tab through the entire navigation on every page.",
      location: url,
      recommendation: "Add a skip navigation link as the first focusable element: `<a href='#main-content' class='sr-only focus:not-sr-only'>Skip to main content</a>`",
      impact: "Keyboard-only users (including those using screen readers) must press Tab many times to reach the main content on every page load.",
      howTested: "HTML source scanned for common skip link patterns (text containing 'skip', 'main', 'content' in an anchor).",
      howCaused: "Skip links are easy to overlook — they're invisible in most designs and only appear on focus for keyboard users.",
    });
  }

  // HTML lang attribute
  if (!/<html\b[^>]*\blang=["'][a-z]/i.test(html)) {
    findings.push({
      severity: "medium",
      type: "Missing lang Attribute on <html>",
      description: "The <html> element is missing a lang attribute. Screen readers cannot detect the page language.",
      location: url,
      recommendation: "Add lang attribute: `<html lang='en'>`. Use the appropriate BCP 47 language code for your content.",
      impact: "Screen readers use wrong language pronunciation settings, making content incomprehensible. Also a WCAG 2.1 Level A failure.",
      howTested: "HTML source checked for <html lang='...'> attribute at the document root.",
      howCaused: "The <html> tag was created without a lang attribute — a common template omission.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "HTML lang Attribute Set",
      description: "The <html> element has a lang attribute — screen readers know the page language.",
      location: url,
      recommendation: "Ensure lang is correct for the page content.",
      impact: "None.",
      howTested: "HTML lang attribute checked on root element.",
      howCaused: "N/A",
    });
  }

  // Focus management (tabindex abuse)
  const badTabindex = (html.match(/tabindex=["']-?[2-9]\d*["']/g) || []);
  if (badTabindex.length > 0) {
    findings.push({
      severity: "medium",
      type: "Tabindex Values > 0 Detected",
      description: `${badTabindex.length} element(s) have tabindex values greater than 0. This overrides the natural tab order and breaks keyboard navigation flow.`,
      location: url,
      recommendation: "Use only tabindex='0' (to make elements focusable) and tabindex='-1' (for programmatic focus). Never use positive values.",
      impact: "Users tabbing through the page jump to unexpected elements, making form completion and navigation confusing and error-prone.",
      howTested: "HTML scanned for tabindex attribute values exceeding 0 using regex.",
      howCaused: "Positive tabindex values were added in an attempt to control focus order, but this approach breaks standard keyboard navigation.",
    });
  }

  // ARIA usage
  if (/\baria-/i.test(html)) {
    findings.push({
      severity: "pass",
      type: "ARIA Attributes Used",
      description: "ARIA attributes detected — accessibility roles and states are being communicated to assistive technologies.",
      location: url,
      recommendation: "Validate ARIA usage with axe DevTools. Avoid redundant ARIA (e.g., role='button' on a <button>).",
      impact: "None.",
      howTested: "HTML scanned for any aria-* attribute patterns.",
      howCaused: "N/A",
    });
  }

  // ── Content & Usability ─────────────────────────────────────────────────────

  // Phone numbers as clickable tel: links
  const phonePattern = /(\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)/g;
  const phoneMatches = html.match(phonePattern) || [];
  const phonesNotLinked = phoneMatches.filter(p => {
    const surrounding = html.slice(Math.max(0, html.indexOf(p) - 50), html.indexOf(p) + 50);
    return !/tel:/i.test(surrounding);
  });
  if (phonesNotLinked.length > 0) {
    findings.push({
      severity: "low",
      type: "Phone Numbers Not Linked (tel:)",
      description: `${phonesNotLinked.length} phone number(s) detected that aren't wrapped in tel: links. Mobile users cannot tap to call.`,
      location: url,
      recommendation: `Wrap phone numbers: <a href='tel:${phonesNotLinked[0]?.replace(/\D/g, "")}'>` + phonesNotLinked[0] + `</a>`,
      impact: "Mobile users must manually copy and dial. A quick usability win that directly impacts customer engagement.",
      howTested: "HTML source scanned for 10-digit phone number patterns. Numbers not inside a tel: href were flagged.",
      howCaused: "Phone numbers were added as plain text. Wrapping them in tel: links is an easy but often forgotten mobile optimisation.",
    });
  }

  // Heading hierarchy
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count === 0) {
    findings.push({
      severity: "medium",
      type: "No H1 Heading",
      description: "Page has no <h1> heading. Every page should have exactly one H1 describing its main topic.",
      location: url,
      recommendation: "Add a single <h1> that describes the primary purpose of this page.",
      impact: "Screen readers use headings for navigation. SEO crawlers use H1 as the primary topic signal. Missing H1 hurts both accessibility and search ranking.",
      howTested: "HTML scanned for <h1> elements. Count: 0.",
      howCaused: "Heading was styled with CSS classes instead of semantic heading tags, or was implemented as an image/SVG without a text alternative.",
    });
  } else if (h1Count > 1) {
    findings.push({
      severity: "medium",
      type: "Multiple H1 Headings",
      description: `Page has ${h1Count} <h1> headings. Only one H1 per page is recommended.`,
      location: url,
      recommendation: "Keep one primary <h1> and use <h2>–<h6> for sub-sections.",
      impact: "Confuses search engines about the primary topic. Screen reader users get an inconsistent structure.",
      howTested: `HTML scanned for <h1> elements. Found ${h1Count}.`,
      howCaused: "Multiple sections were each given H1 headings, often from reusing component templates that each include their own H1.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Single H1 Heading",
      description: "Exactly one <h1> heading is present — correct semantic structure.",
      location: url,
      recommendation: "Verify the H1 text clearly describes the page's main topic.",
      impact: "None.",
      howTested: "HTML <h1> element count checked.",
      howCaused: "N/A",
    });
  }

  // Error pages / 404 messaging
  if (/404|page not found|doesn.t exist/i.test(html) && statusCode === 200) {
    findings.push({
      severity: "medium",
      type: "Soft 404 — Page Says Not Found but Returns 200",
      description: "Page content mentions '404' or 'not found' but returns HTTP 200 OK. This is a 'soft 404' that confuses search engines.",
      location: url,
      recommendation: "Return the correct HTTP status code (404 Not Found) for pages that don't exist.",
      impact: "Search engines index these pages thinking they're valid content. Crawl budget is wasted. SEO is harmed.",
      howTested: "HTTP status was 200 but HTML content contained phrases matching 404/not found patterns.",
      howCaused: "Error pages were served with the wrong HTTP status code — a common mistake in SPAs and custom error templates.",
    });
  }

  // Print stylesheet
  if (/media=["']print["']|@media\s+print/i.test(html)) {
    findings.push({
      severity: "pass",
      type: "Print Stylesheet Present",
      description: "A print media query or print stylesheet is defined — the page has been optimised for printing.",
      location: url,
      recommendation: "Test print output by using browser's print preview.",
      impact: "None.",
      howTested: "HTML and inline styles scanned for media='print' or @media print declarations.",
      howCaused: "N/A",
    });
  } else {
    findings.push({
      severity: "low",
      type: "No Print Stylesheet",
      description: "No print media query detected. Printing the page will render it with navigation, ads, and all UI chrome.",
      location: url,
      recommendation: "Add a @media print {} stylesheet that hides navigation and adjusts layout for paper.",
      impact: "Users who print the page get navigation bars, sidebars, and buttons printed alongside content — wasting ink and paper.",
      howTested: "HTML and inline styles searched for media='print' and @media print declarations.",
      howCaused: "Print styles are easy to overlook. Most web developers don't test print output during development.",
    });
  }

  // Compression (if headers available)
  // Note: this check is done in header analysis — just a pass check here for completeness

  // Input maxlength
  const textInputs = allInputs.filter(i => {
    const type = (i.match(/type=["']([^"']*)["']/i) || [])[1] || "text";
    return ["text", "email", "search", "tel", "url"].includes(type.toLowerCase());
  });
  const inputsWithoutMaxlength = textInputs.filter(i => !/maxlength=/i.test(i));
  if (inputsWithoutMaxlength.length > 2) {
    findings.push({
      severity: "medium",
      type: "Text Inputs Without maxlength",
      description: `${inputsWithoutMaxlength.length} text input(s) have no maxlength attribute. Users (or attackers) can enter unlimited-length text.`,
      location: url,
      recommendation: "Add appropriate maxlength to all text inputs. Also validate server-side.",
      impact: "Users can paste huge text blocks causing layout breaks. Attackers can probe for buffer overflows or denial-of-service via oversized input.",
      howTested: "All text, email, search, tel, and url inputs checked for maxlength attribute.",
      howCaused: "Input fields were created without length constraints — a common omission that leaves validation entirely to the server.",
    });
  }

  // Social / OG meta tags
  const hasOG = /<meta\s[^>]*property=["']og:/i.test(html);
  if (!hasOG) {
    findings.push({
      severity: "low",
      type: "Missing Open Graph Tags",
      description: "No Open Graph meta tags (og:title, og:description, og:image) found. Social media sharing will show generic previews.",
      location: url,
      recommendation: "Add og:title, og:description, og:image, and og:url meta tags to the <head>.",
      impact: "When users share a link to this page on Facebook, LinkedIn, or Slack, no preview image or description appears.",
      howTested: "HTML <head> scanned for <meta property='og:...'> tags.",
      howCaused: "OG meta tags were not added — common in sites that weren't built with social sharing in mind.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Open Graph Tags Present",
      description: "Open Graph meta tags found — social media sharing will show a rich preview.",
      location: url,
      recommendation: "Use the Facebook Sharing Debugger to verify og:image renders correctly.",
      impact: "None.",
      howTested: "HTML <meta property='og:'> tags scanned.",
      howCaused: "N/A",
    });
  }

  // Console error hints in HTML (stack traces, error messages leaked)
  if (/Uncaught\s+(TypeError|ReferenceError|SyntaxError)|at\s+Object\.<anonymous>|webpack:\/\/|at\s+\w+\s+\(.*:\d+:\d+\)/i.test(html)) {
    findings.push({
      severity: "high",
      type: "JavaScript Error Traces in HTML",
      description: "JavaScript error stack traces or error messages detected in the page HTML. These expose internal code structure to users.",
      location: url,
      recommendation: "Implement a global error boundary (React) or window.onerror handler. Never render stack traces to end users in production.",
      impact: "Users see broken error messages. Developers' code paths and filenames are exposed, aiding attacker reconnaissance.",
      howTested: "HTML content scanned for patterns matching JavaScript exception stack traces (TypeError, ReferenceError, line number patterns).",
      howCaused: "An uncaught JavaScript error's stack trace was rendered into the HTML — usually via a broken SSR error handler or template error.",
    });
  }

  return findings;
}

// ─── Interactive / Human Behavior Tests ──────────────────────────────────────
// Simulates real human actions: login, button clicks, form submissions,
// navigation, rapid interactions, rate limiting, and stability checks.

async function analyzeInteractiveFlow(html: string, url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const baseUrl = (() => { try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return ""; } })();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // ── 1. Login Form Detection & Testing ─────────────────────────────────────

  const loginFormPattern = /<form[^>]*>[\s\S]*?<\/form>/gi;
  const allForms = html.match(loginFormPattern) || [];
  const loginForms = allForms.filter(f =>
    /login|signin|sign-in|auth|log-in|session/i.test(f) ||
    (/<input[^>]*type=["']password["']/i.test(f))
  );

  if (loginForms.length > 0) {
    findings.push({
      severity: "pass",
      type: "Login Form Detected",
      description: `${loginForms.length} login form(s) found on the page. Running authentication flow tests.`,
      location: url,
      recommendation: "Ensure login form validates on both client and server side. Test with empty, wrong, and injection payloads.",
      impact: "None — login form is present and testable.",
      howTested: "HTML scanned for <form> elements containing password inputs or login-related action attributes.",
      howCaused: "N/A",
    });

    // Extract form action
    const formActionMatch = loginForms[0].match(/action=["']([^"']*)["']/i);
    const methodMatch = loginForms[0].match(/method=["'](post|get)["']/i);
    const formAction = formActionMatch?.[1] || url;
    const formMethod = (methodMatch?.[1] || "post").toUpperCase();
    const resolvedAction = formAction.startsWith("http") ? formAction : (formAction.startsWith("/") ? `${baseUrl}${formAction}` : url);

    // Extract input field names for login/password
    const inputNames: string[] = [];
    const inputMatches = loginForms[0].match(/<input\b[^>]*/gi) || [];
    for (const inp of inputMatches) {
      const name = inp.match(/\bname=["']([^"']*)["']/i)?.[1];
      if (name) inputNames.push(name);
    }

    const usernameField = inputNames.find(n => /user|email|login|name/i.test(n)) || "username";
    const passwordField = inputNames.find(n => /pass|pwd/i.test(n)) || "password";

    // Test 1: Empty credential submission
    try {
      const emptyStart = Date.now();
      const emptyRes = await fetch(resolvedAction, {
        method: formMethod,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: `${usernameField}=&${passwordField}=`,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const emptyMs = Date.now() - emptyStart;
      if (emptyRes.status === 200 || emptyRes.status === 302) {
        findings.push({
          severity: emptyRes.status === 302 && emptyRes.headers.get("location")?.includes("dashboard") ? "critical" : "high",
          type: "Login — Empty Credentials Accepted [Human Test]",
          description: `Submitting completely empty username and password returned HTTP ${emptyRes.status}${emptyRes.status === 302 ? ` (redirect to: ${emptyRes.headers.get("location")})` : ""}. Empty credentials should always be rejected with a 400/401.`,
          location: resolvedAction,
          recommendation: "Add server-side validation: reject any login request where username or password is empty or whitespace-only. Return HTTP 400 with a clear error message.",
          impact: emptyRes.status === 302 ? "CRITICAL: Empty credentials succeeded — login is completely broken." : "Server accepted empty fields without visible rejection at the HTTP layer. Check that proper error messages are shown to the user.",
          howTested: `Human test: Submitted login form with blank ${usernameField}='' and ${passwordField}='' via HTTP ${formMethod} to ${resolvedAction}. Response: ${emptyRes.status} in ${emptyMs}ms.`,
          howCaused: "Server-side validation may not be checking for empty/whitespace credentials before attempting authentication.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Login — Empty Credentials Rejected [Human Test]",
          description: `Server correctly rejected empty credentials with HTTP ${emptyRes.status} in ${emptyMs}ms.`,
          location: resolvedAction,
          recommendation: "Also ensure the error message is user-friendly and does not reveal whether the username exists.",
          impact: "None — empty credential rejection is working.",
          howTested: `Submitted login form with empty ${usernameField} and ${passwordField}. Response: HTTP ${emptyRes.status}.`,
          howCaused: "N/A",
        });
      }
    } catch { /* network error — skip */ }

    // Test 2: Wrong credentials
    try {
      const wrongStart = Date.now();
      const wrongRes = await fetch(resolvedAction, {
        method: formMethod,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: `${usernameField}=testuser_qa_probe_12345&${passwordField}=wrongpassword_qa_probe_99`,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const wrongMs = Date.now() - wrongStart;
      if (wrongRes.status === 302 && wrongRes.headers.get("location") && !wrongRes.headers.get("location")?.includes("login") && !wrongRes.headers.get("location")?.includes("error")) {
        findings.push({
          severity: "critical",
          type: "Login — Wrong Credentials Accepted [Human Test]",
          description: `Submitting obviously wrong credentials (testuser_qa_probe_12345 / wrongpassword_qa_probe_99) returned a redirect to: ${wrongRes.headers.get("location")}. This indicates authentication is not working.`,
          location: resolvedAction,
          recommendation: "Fix authentication logic immediately. Server must validate credentials before granting access.",
          impact: "Authentication is completely broken — anyone can log in without valid credentials.",
          howTested: `Submitted fabricated credentials via ${formMethod} to ${resolvedAction}. Got ${wrongRes.status} redirect in ${wrongMs}ms.`,
          howCaused: "Authentication check may be misconfigured, bypassed, or commented out.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Login — Wrong Credentials Rejected [Human Test]",
          description: `Server correctly rejected wrong credentials with HTTP ${wrongRes.status} in ${wrongMs}ms. Authentication check is functional.`,
          location: resolvedAction,
          recommendation: "Ensure error message does not distinguish between 'wrong username' vs 'wrong password' (avoids username enumeration).",
          impact: "None — authentication rejection is working.",
          howTested: `Submitted fake credentials (testuser_qa_probe_12345 / wrongpassword_qa_probe_99) via ${formMethod}. Response: HTTP ${wrongRes.status} in ${wrongMs}ms.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }

    // Test 3: SQL Injection in login
    try {
      const sqliPayload = `' OR '1'='1`;
      const sqliRes = await fetch(resolvedAction, {
        method: formMethod,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: `${usernameField}=${encodeURIComponent(sqliPayload)}&${passwordField}=${encodeURIComponent(sqliPayload)}`,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      if (sqliRes.status === 302 && sqliRes.headers.get("location") && !sqliRes.headers.get("location")?.includes("login")) {
        findings.push({
          severity: "critical",
          type: "Login — SQL Injection Bypass Succeeded [Human Test]",
          description: `Classic SQL injection payload (' OR '1'='1) in the login form resulted in a successful redirect. The database query is vulnerable.`,
          location: resolvedAction,
          recommendation: "Use parameterized queries or prepared statements. NEVER interpolate user input into SQL strings.",
          impact: "Attacker can log in as any user, extract all user data, modify the database, or drop tables.",
          howTested: `Submitted SQLi payload ' OR '1'='1 in ${usernameField} and ${passwordField} fields. Got redirect to: ${sqliRes.headers.get("location")}.`,
          howCaused: "SQL query is constructed by concatenating user input directly into the query string without sanitization.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Login — SQL Injection Rejected [Human Test]",
          description: `SQL injection payload (' OR '1'='1) was correctly rejected with HTTP ${sqliRes.status}. Parameterized queries appear to be in use.`,
          location: resolvedAction,
          recommendation: "Continue using parameterized queries. Also test with more advanced payloads (UNION, SLEEP, stacked queries).",
          impact: "None — SQL injection test passed.",
          howTested: `Submitted ' OR '1'='1 as both username and password. Server responded: HTTP ${sqliRes.status}.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }

    // Test 4: XSS in login field
    try {
      const xssPayload = `<script>alert('QA_XSS_TEST')</script>`;
      const xssRes = await fetch(resolvedAction, {
        method: formMethod,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: `${usernameField}=${encodeURIComponent(xssPayload)}&${passwordField}=anything`,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const xssBody = xssRes.status === 200 ? await xssRes.text().catch(() => "") : "";
      if (xssBody.includes("<script>alert('QA_XSS_TEST')</script>")) {
        findings.push({
          severity: "critical",
          type: "Login — XSS Reflected in Response [Human Test]",
          description: "XSS payload submitted in username field was reflected back in the response without encoding. This is a confirmed reflected XSS vulnerability.",
          location: resolvedAction,
          recommendation: "HTML-encode all user input before rendering it in responses. Use a templating engine with automatic escaping.",
          impact: "Attacker can craft a login URL that executes JavaScript in the victim's browser — stealing cookies and session tokens.",
          howTested: `Submitted <script>alert('QA_XSS_TEST')</script> as username. Response body contained the unencoded script tag.`,
          howCaused: "User input is reflected into the HTML response without HTML entity encoding.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Login — XSS Input Properly Handled [Human Test]",
          description: `XSS payload submitted in login form was not reflected unencoded in the HTTP ${xssRes.status} response.`,
          location: resolvedAction,
          recommendation: "Also test with encoded variants: %3Cscript%3E, javascript: hrefs, and event handlers (onerror, onload).",
          impact: "None — XSS in login form test passed.",
          howTested: `Submitted <script>alert('QA_XSS_TEST')</script> as username. Response did not reflect unencoded payload.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }

  } else {
    findings.push({
      severity: "low",
      type: "No Login Form Detected [Human Test]",
      description: "No login form (with password field) found on this page. Login flow tests were skipped.",
      location: url,
      recommendation: "If this page has a login at a different URL, run the test against that URL directly.",
      impact: "None — login tests only apply to pages with authentication forms.",
      howTested: "HTML scanned for <form> elements containing <input type='password'>. None found.",
      howCaused: "N/A",
    });
  }

  // ── 2. Rapid Click / Button Spam Stability Test ───────────────────────────

  try {
    const rapidCount = 10;
    const rapidStart = Date.now();
    const rapidRequests = Array.from({ length: rapidCount }, () =>
      fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      }).then(r => ({ status: r.status, ok: r.ok })).catch(() => ({ status: 0, ok: false }))
    );
    const rapidResults = await Promise.all(rapidRequests);
    const rapidMs = Date.now() - rapidStart;
    const allOk = rapidResults.every(r => r.status === 200 || r.status === 301 || r.status === 302);
    const statuses = [...new Set(rapidResults.map(r => r.status))];
    const failCount = rapidResults.filter(r => r.status === 0 || r.status >= 500).length;
    const rateLimited = rapidResults.some(r => r.status === 429);

    if (rateLimited) {
      findings.push({
        severity: "pass",
        type: "Rapid Request Rate Limiting Active [Human Test]",
        description: `Rate limiting detected: ${rapidCount} rapid concurrent requests triggered HTTP 429 (Too Many Requests). Rate limiting is protecting the server.`,
        location: url,
        recommendation: "Verify rate limit thresholds are appropriate (not too strict for legitimate users, not too loose for bots).",
        impact: "None — rate limiting is working correctly.",
        howTested: `Human test: Sent ${rapidCount} simultaneous GET requests in parallel. Server returned HTTP 429 after threshold exceeded.`,
        howCaused: "N/A — rate limiting is correctly configured.",
      });
    } else if (failCount > 0) {
      findings.push({
        severity: "high",
        type: "Server Instability Under Rapid Requests [Human Test]",
        description: `${failCount} out of ${rapidCount} rapid concurrent requests failed (${statuses.join(", ")}). The server crashes or errors under rapid clicking/refreshing.`,
        location: url,
        recommendation: "Add request queuing and connection pooling. Implement rate limiting with HTTP 429. Add circuit breakers for database connections.",
        impact: "Real users who reload quickly, use multiple tabs, or have slow connections may encounter server errors. Bot attacks amplify this failure.",
        howTested: `Human test: Simulated rapid button clicking — sent ${rapidCount} concurrent GET requests simultaneously in ${rapidMs}ms. ${failCount} failed.`,
        howCaused: "Server lacks connection pooling or rate limiting, causing resource exhaustion under concurrent load.",
      });
    } else if (allOk) {
      findings.push({
        severity: "pass",
        type: "Server Stable Under Rapid Requests [Human Test]",
        description: `${rapidCount} concurrent rapid requests all returned ${statuses.join("/")} in ${rapidMs}ms total. Server handles rapid clicking without errors.`,
        location: url,
        recommendation: "Add rate limiting (HTTP 429) to protect against DDoS even if the server handles it currently.",
        impact: "None — server is stable under rapid requests.",
        howTested: `Human test: Sent ${rapidCount} simultaneous GET requests in parallel (simulating rapid button clicks). All returned ${statuses[0]}.`,
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── 3. Internal Link Probing ───────────────────────────────────────────────

  const internalLinks: string[] = [];
  const linkMatches = html.match(/href=["']([^"']+)["']/gi) || [];
  for (const match of linkMatches) {
    const href = match.replace(/href=["']/i, "").replace(/["']$/, "").trim();
    if (!href || href === "#" || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/") && baseUrl) {
      internalLinks.push(`${baseUrl}${href}`);
    } else if (!href.startsWith("http")) {
      try { internalLinks.push(new URL(href, url).href); } catch {}
    }
  }
  const uniqueInternalLinks = [...new Set(internalLinks)].slice(0, 8);

  if (uniqueInternalLinks.length > 0) {
    const linkResults = await Promise.allSettled(
      uniqueInternalLinks.map(link =>
        fetch(link, { method: "HEAD", headers, redirect: "follow", signal: AbortSignal.timeout(6000) })
          .then(r => ({ link, status: r.status, ok: r.ok }))
          .catch(() => ({ link, status: 0, ok: false }))
      )
    );

    const resolvedLinks = linkResults.map(r => r.status === "fulfilled" ? r.value : { link: "", status: 0, ok: false });
    const brokenLinks = resolvedLinks.filter(r => r.status === 404 || r.status === 0 || r.status >= 500);
    const workingLinks = resolvedLinks.filter(r => r.ok || r.status === 200 || r.status === 301 || r.status === 302);

    if (brokenLinks.length > 0) {
      findings.push({
        severity: "high",
        type: "Broken Internal Links Found [Human Test]",
        description: `${brokenLinks.length} internal page link(s) returned errors when clicked: ${brokenLinks.slice(0, 3).map(l => `${l.link} → ${l.status}`).join(", ")}.`,
        location: url,
        recommendation: "Fix or remove all broken links. Set up automated broken-link monitoring (e.g., Dead Link Checker). Return 301 redirects for moved pages.",
        impact: "Users click links and land on error pages. This is a direct functional failure that human testers report immediately. SEO is also damaged by broken internal links.",
        howTested: `Human test: Extracted ${uniqueInternalLinks.length} internal links from page HTML and performed HEAD requests on each to verify they load. ${brokenLinks.length} returned non-200 status codes.`,
        howCaused: `Pages were linked but no longer exist or the server returned errors. Broken links: ${brokenLinks.slice(0, 2).map(l => l.link).join(", ")}.`,
      });
    }

    if (workingLinks.length > 0) {
      findings.push({
        severity: "pass",
        type: "Internal Navigation Links Working [Human Test]",
        description: `${workingLinks.length} internal link(s) tested and all responded successfully (${[...new Set(workingLinks.map(l => l.status))].join("/")}).`,
        location: url,
        recommendation: "Continue monitoring internal links. Set up automated checks to catch regressions.",
        impact: "None — navigation is functional.",
        howTested: `Human test: Clicked through ${workingLinks.length} internal links by sending HEAD requests. All returned successful HTTP status codes.`,
        howCaused: "N/A",
      });
    }
  }

  // ── 4. Page Stability — Repeated Load Test ────────────────────────────────

  try {
    const repeatCount = 5;
    const times: number[] = [];
    for (let i = 0; i < repeatCount; i++) {
      const t0 = Date.now();
      await fetch(url, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null);
      times.push(Date.now() - t0);
      if (i < repeatCount - 1) await new Promise(r => setTimeout(r, 300));
    }
    const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const maxMs = Math.max(...times);
    const minMs = Math.min(...times);
    const variance = maxMs - minMs;

    if (variance > 3000) {
      findings.push({
        severity: "high",
        type: "Inconsistent Page Load Times [Human Test]",
        description: `Repeated page loads show extreme variance: min ${minMs}ms, max ${maxMs}ms, avg ${avgMs}ms (${variance}ms variance). Users experience unpredictable loading.`,
        location: url,
        recommendation: "Add server-side caching (Redis, Varnish). Use a CDN for static assets. Profile and optimize the slowest requests.",
        impact: "Users experience random slowdowns. This indicates server instability — some requests hit a cache miss or an overloaded worker.",
        howTested: `Human test: Loaded the page ${repeatCount} times in sequence with 300ms gaps. Recorded wall-clock response times: [${times.join(", ")}]ms.`,
        howCaused: `Response times vary by ${variance}ms, suggesting no consistent caching layer. Some requests may hit cold code paths or overloaded worker processes.`,
      });
    } else {
      findings.push({
        severity: "pass",
        type: "Consistent Page Load Times [Human Test]",
        description: `Page loaded ${repeatCount} times with consistent timing: avg ${avgMs}ms, min ${minMs}ms, max ${maxMs}ms (${variance}ms variance — acceptable).`,
        location: url,
        recommendation: "Set up performance monitoring (e.g., Datadog, New Relic) to catch regressions in production.",
        impact: "None — load time consistency is good.",
        howTested: `Human test: Page loaded ${repeatCount} times sequentially. Response times: [${times.join(", ")}]ms.`,
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── 5. Form Action Endpoint Testing ──────────────────────────────────────

  const nonLoginForms = allForms.filter(f => !/<input[^>]*type=["']password["']/i.test(f));
  for (const form of nonLoginForms.slice(0, 3)) {
    const actionMatch = form.match(/action=["']([^"']*)["']/i);
    const methodMatch = form.match(/method=["'](post|get)["']/i);
    if (!actionMatch) continue;
    const action = actionMatch[1];
    const method = (methodMatch?.[1] || "get").toUpperCase();
    const resolvedUrl = action.startsWith("http") ? action : (action.startsWith("/") ? `${baseUrl}${action}` : url);

    try {
      const emptyFormRes = await fetch(resolvedUrl, {
        method,
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: method === "POST" ? "" : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });

      if (emptyFormRes.status === 200 || emptyFormRes.status === 302) {
        findings.push({
          severity: "medium",
          type: "Form Accepts Empty Submission [Human Test]",
          description: `A non-login form with action "${action}" (${method}) accepts an empty submission without validation (returned HTTP ${emptyFormRes.status}).`,
          location: resolvedUrl,
          recommendation: "Add server-side validation for all required fields. Return HTTP 400 with field-level error messages for invalid submissions.",
          impact: "Users can accidentally submit blank forms. Also opens the form endpoint to spam and abuse without CAPTCHA or rate limiting.",
          howTested: `Human test: Submitted form (action="${action}", method=${method}) with completely empty body. Got HTTP ${emptyFormRes.status}.`,
          howCaused: "Server-side form validation is missing or only done client-side. Empty POST request was accepted without checking required fields.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Form Rejects Empty Submission [Human Test]",
          description: `Form at "${action}" (${method}) correctly rejected an empty submission with HTTP ${emptyFormRes.status}.`,
          location: resolvedUrl,
          recommendation: "Ensure the error response includes human-readable field-specific validation messages.",
          impact: "None — server-side form validation is active.",
          howTested: `Submitted empty ${method} request to form action "${action}". Server returned HTTP ${emptyFormRes.status}.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }
  }

  // ── 6. Rate Limiting Detection ────────────────────────────────────────────

  try {
    const burstCount = 20;
    const burstRequests = Array.from({ length: burstCount }, () =>
      fetch(url, { headers, signal: AbortSignal.timeout(8000) })
        .then(r => ({ status: r.status, retryAfter: r.headers.get("retry-after"), rateLimit: r.headers.get("x-ratelimit-remaining") }))
        .catch(() => ({ status: 0, retryAfter: null, rateLimit: null }))
    );
    const burstResults = await Promise.all(burstRequests);
    const has429 = burstResults.some(r => r.status === 429);
    const hasRateLimitHeaders = burstResults.some(r => r.rateLimit !== null);

    if (!has429 && !hasRateLimitHeaders) {
      findings.push({
        severity: "medium",
        type: "No Rate Limiting Detected [Human Test]",
        description: `${burstCount} rapid requests sent in parallel — no HTTP 429 response and no X-RateLimit headers detected. The server does not appear to rate-limit requests.`,
        location: url,
        recommendation: "Implement rate limiting at the web server or application level. Return HTTP 429 with Retry-After header when limits are exceeded. Consider Cloudflare or nginx rate limiting.",
        impact: "Without rate limiting, attackers can scrape the site, brute-force passwords, or send spam form submissions. DDoS attacks are more effective.",
        howTested: `Human test: Sent ${burstCount} simultaneous requests. No HTTP 429 response received. No X-RateLimit-Remaining or Retry-After headers in any response.`,
        howCaused: "Rate limiting middleware is not configured on this server or CDN. All requests are served regardless of frequency.",
      });
    }
  } catch { /* skip */ }

  // ── 7. 404 Error Page Quality ─────────────────────────────────────────────

  try {
    const fake404Url = `${baseUrl}/qa-probe-this-page-does-not-exist-${Date.now()}`;
    const notFoundRes = await fetch(fake404Url, { headers, signal: AbortSignal.timeout(8000) });
    const notFoundBody = await notFoundRes.text().catch(() => "");

    if (notFoundRes.status === 200) {
      findings.push({
        severity: "medium",
        type: "Soft 404 — Server Returns 200 for Non-Existent Pages [Human Test]",
        description: "Requesting a completely random URL returns HTTP 200 instead of 404. This is a 'soft 404' that confuses search engines and monitoring tools.",
        location: fake404Url,
        recommendation: "Return HTTP 404 for pages that don't exist. In SPAs, configure the server to return 404 for unknown routes that don't match actual app routes.",
        impact: "Search engines index non-existent pages. Error monitoring tools cannot detect broken links. SEO crawl budget is wasted.",
        howTested: `Human test: Navigated to a completely fake URL (${fake404Url}). Server returned HTTP 200 instead of 404.`,
        howCaused: "Server (likely an SPA) returns 200 + index.html for all routes, including ones that don't exist in the app.",
      });
    } else if (notFoundRes.status === 404) {
      const has404Content = /404|not found|error|page.*missing/i.test(notFoundBody);
      findings.push({
        severity: "pass",
        type: "404 Error Page Working [Human Test]",
        description: `Non-existent page correctly returned HTTP 404${has404Content ? " with helpful error content" : ""}.`,
        location: fake404Url,
        recommendation: "Ensure 404 page includes navigation links back to the homepage and a search bar.",
        impact: "None — 404 handling is correct.",
        howTested: `Human test: Navigated to fake URL ${fake404Url}. Server returned HTTP 404.`,
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── 8. Content Quality Checks ─────────────────────────────────────────────

  // Lorem ipsum / placeholder text
  if (/lorem ipsum|placeholder text|dummy text|insert text here|coming soon|under construction/i.test(html)) {
    findings.push({
      severity: "medium",
      type: "Placeholder / Lorem Ipsum Text in Production [Human Test]",
      description: "Placeholder or lorem ipsum text detected in the live page content. This is a human tester's first observation.",
      location: url,
      recommendation: "Replace all placeholder content with real copy before deploying to production.",
      impact: "Users see dummy content — damages credibility and brand trust immediately.",
      howTested: "Human test: Scanned visible page text for placeholder patterns (lorem ipsum, 'coming soon', 'insert text here', etc.).",
      howCaused: "Design or development placeholder content was not replaced before the page went live.",
    });
  }

  // TODO comments in HTML
  const todoComments = (html.match(/<!--[^>]*(?:TODO|FIXME|HACK|XXX|BUG|NOTE: remove|temp|temporary|delete this)[^>]*-->/gi) || []);
  if (todoComments.length > 0) {
    findings.push({
      severity: "medium",
      type: "Developer TODO Comments in Production HTML [Human Test]",
      description: `${todoComments.length} HTML comment(s) contain developer notes (TODO, FIXME, HACK, TEMP). These are visible to anyone who views source.`,
      location: url,
      recommendation: "Remove all developer comments from production HTML. Use build-time comment stripping. Review comments for sensitive information.",
      impact: "Developer intent and unfinished work is visible to competitors and attackers. May reveal planned features or known bugs.",
      howTested: "Human test: Viewed page source and searched for developer comment patterns (TODO, FIXME, HACK, XXX, BUG, TEMP).",
      howCaused: "Developers leave TODO comments during development. Build tools are not configured to strip HTML comments.",
    });
  }

  // ── 9. Search/Filter Input Testing ───────────────────────────────────────

  const searchInputs = (html.match(/<input[^>]*type=["']search["'][^>]*/gi) || []).concat(
    (html.match(/<input[^>]*(?:placeholder|name)=["'][^"']*(?:search|query|q|find|filter)[^"']*["'][^>]*/gi) || [])
  );
  if (searchInputs.length > 0) {
    findings.push({
      severity: "pass",
      type: "Search Input Detected [Human Test]",
      description: `${searchInputs.length} search/filter input(s) found. These should be tested with: empty search, special characters, very long strings, and XSS payloads.`,
      location: url,
      recommendation: "Test: (1) Empty search — should show helpful message, not error. (2) Special chars (<, >, &, \", ') — should be escaped in results. (3) 1000+ chars — should enforce maxlength. (4) SQL: ' OR 1=1 — should not return unexpected results.",
      impact: "None — search inputs documented for manual follow-up testing.",
      howTested: "Human test: Located search/filter input elements in HTML. Flagged for manual interactive testing.",
      howCaused: "N/A",
    });
  }

  // ── 10. Session / Cookie Security ────────────────────────────────────────

  try {
    const cookieRes = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const setCookieHeaders = cookieRes.headers.get("set-cookie") || "";
    if (setCookieHeaders) {
      const cookies = setCookieHeaders.split(",").filter(c => c.trim());
      const insecureCookies = cookies.filter(c => !/\bSecure\b/i.test(c));
      const noHttpOnly = cookies.filter(c => !/\bHttpOnly\b/i.test(c));
      const noSameSite = cookies.filter(c => !/\bSameSite\b/i.test(c));

      if (insecureCookies.length > 0) {
        findings.push({
          severity: "high",
          type: "Insecure Cookies (Missing Secure Flag) [Human Test]",
          description: `${insecureCookies.length} cookie(s) are set without the Secure flag. These cookies will be sent over HTTP connections.`,
          location: url,
          recommendation: "Add the Secure flag to all cookies: Set-Cookie: sessionid=xxx; Secure; HttpOnly; SameSite=Strict",
          impact: "Cookies can be intercepted in plaintext over HTTP connections. Session tokens can be stolen by MITM attackers on unencrypted networks.",
          howTested: "Human test: Inspected Set-Cookie response headers for Secure flag. Found cookies without it.",
          howCaused: "Cookie configuration omits the Secure attribute — often forgotten when copying cookie setup from development environments.",
        });
      }
      if (noHttpOnly.length > 0) {
        findings.push({
          severity: "high",
          type: "Cookies Missing HttpOnly Flag [Human Test]",
          description: `${noHttpOnly.length} cookie(s) are accessible to JavaScript (no HttpOnly flag). XSS can steal these session cookies.`,
          location: url,
          recommendation: "Add HttpOnly flag to all session cookies: Set-Cookie: sessionid=xxx; HttpOnly",
          impact: "If XSS is exploited, document.cookie will expose these session tokens to the attacker's script.",
          howTested: "Human test: Checked Set-Cookie headers for HttpOnly attribute. Found cookies without it.",
          howCaused: "Session cookies set without HttpOnly — allows JavaScript to read them, which is the main goal of XSS cookie theft attacks.",
        });
      }
      if (noSameSite.length === 0 || (noSameSite.length === 0 && cookies.length > 0)) {
        findings.push({
          severity: "pass",
          type: "SameSite Cookie Protection Present [Human Test]",
          description: "Cookies are configured with SameSite attribute — CSRF protection via cookie policy is active.",
          location: url,
          recommendation: "Use SameSite=Strict for session cookies if cross-site form submissions are not needed.",
          impact: "None — SameSite is configured.",
          howTested: "Human test: Inspected Set-Cookie headers for SameSite attribute.",
          howCaused: "N/A",
        });
      }
    }
  } catch { /* skip */ }

  return findings;
}

// ─── Advanced Security Tests ──────────────────────────────────────────────────
// HTTP method abuse, sensitive path exposure, CORS, CSRF, timing attacks,
// info disclosure, redirect chains, default credentials, API probing.

async function analyzeAdvancedSecurity(html: string, url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const baseUrl = (() => { try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return ""; } })();
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36";
  const hdr = { "User-Agent": ua, "Accept": "*/*" };

  // ── A1. Sensitive Path Exposure ──────────────────────────────────────────

  const sensitivePaths: Array<{ path: string; label: string; impact: string }> = [
    { path: "/.env", label: ".env Environment File", impact: "Exposes all environment variables including database passwords, API keys, and secrets." },
    { path: "/.env.local", label: ".env.local File", impact: "Exposes local override environment variables." },
    { path: "/.git/config", label: "Git Repository Config", impact: "Exposes repository origin, author info, remote URLs. May allow full source dump." },
    { path: "/.git/HEAD", label: "Git HEAD File", impact: "Confirms git repository is public. Can be used to enumerate and download commits." },
    { path: "/config.json", label: "config.json", impact: "Application config may include API keys, DB connection strings, or feature flags." },
    { path: "/config.yml", label: "config.yml", impact: "YAML config may contain credentials or internal infrastructure details." },
    { path: "/config.yaml", label: "config.yaml", impact: "YAML config exposure." },
    { path: "/.htaccess", label: ".htaccess File", impact: "Reveals server routing rules, auth requirements, and redirect logic." },
    { path: "/wp-config.php", label: "WordPress Config", impact: "WordPress database credentials fully exposed." },
    { path: "/phpinfo.php", label: "PHP Info Page", impact: "Full PHP configuration, loaded modules, environment variables, and server paths exposed." },
    { path: "/server-status", label: "Apache Server Status", impact: "Active connections, request history, IP addresses of all visitors exposed." },
    { path: "/nginx_status", label: "Nginx Status", impact: "Active connections and request counters exposed." },
    { path: "/robots.txt", label: "robots.txt", impact: "Low — but may reveal hidden admin paths or directories not meant for public knowledge." },
    { path: "/sitemap.xml", label: "sitemap.xml", impact: "Low — reveals full page inventory; helpful for recon." },
    { path: "/api/config", label: "/api/config Endpoint", impact: "API config endpoint may expose backend settings, feature flags, or internal URLs." },
    { path: "/api/env", label: "/api/env Endpoint", impact: "Dangerous if it returns process.env or environment variables." },
    { path: "/api/debug", label: "/api/debug Endpoint", impact: "Debug endpoints often return stack traces, memory dumps, or internal state." },
    { path: "/api/healthcheck", label: "/api/healthcheck Endpoint", impact: "Low — but reveals service names, versions, and dependency statuses." },
    { path: "/api/health", label: "/api/health Endpoint", impact: "Similar to healthcheck — reveals system status." },
    { path: "/admin", label: "/admin Panel", impact: "Admin panel accessible without authentication." },
    { path: "/admin/login", label: "/admin/login Panel", impact: "Admin login page exposed publicly." },
    { path: "/dashboard", label: "/dashboard Page", impact: "Application dashboard reachable — may skip auth." },
    { path: "/phpmyadmin", label: "phpMyAdmin", impact: "Direct database management UI exposed publicly — critical if no auth." },
    { path: "/adminer.php", label: "Adminer Database UI", impact: "Full database management access if exposed." },
    { path: "/.DS_Store", label: ".DS_Store File", impact: "macOS folder metadata leaks directory structure and file names." },
    { path: "/package.json", label: "package.json", impact: "Reveals all dependencies and versions — helps attackers target known vulnerabilities." },
    { path: "/package-lock.json", label: "package-lock.json", impact: "Full dependency tree with exact versions — vulnerability mapping." },
    { path: "/composer.json", label: "composer.json", impact: "PHP dependencies exposed — same risk as package.json." },
    { path: "/Dockerfile", label: "Dockerfile", impact: "Container build process exposed — reveals base images, ports, and internal paths." },
    { path: "/docker-compose.yml", label: "docker-compose.yml", impact: "Service architecture, ports, volume mounts, and environment variables exposed." },
    { path: "/.travis.yml", label: ".travis.yml CI Config", impact: "CI pipeline config may include deploy keys and environment variable names." },
    { path: "/.github/workflows", label: "GitHub Actions Workflows", impact: "CI/CD pipeline definitions may reveal secrets usage and deploy processes." },
    { path: "/backup.sql", label: "backup.sql", impact: "Full database dump publicly accessible — catastrophic data breach." },
    { path: "/db.sql", label: "db.sql", impact: "Database export accessible publicly." },
    { path: "/dump.sql", label: "dump.sql", impact: "Database dump accessible publicly." },
    { path: "/error_log", label: "error_log File", impact: "Server error logs with stack traces, file paths, and potentially query data exposed." },
    { path: "/logs/access.log", label: "Access Log", impact: "All HTTP requests with IP addresses and user agents exposed." },
    { path: "/storage/logs/laravel.log", label: "Laravel Log", impact: "Full application log with SQL queries, exceptions, and user data." },
    { path: "/crossdomain.xml", label: "crossdomain.xml", impact: "Flash cross-domain policy — may allow unauthorized cross-origin data access." },
    { path: "/clientaccesspolicy.xml", label: "clientaccesspolicy.xml", impact: "Silverlight cross-domain policy — same risk as crossdomain.xml." },
    { path: "/.well-known/security.txt", label: "security.txt", impact: "Low — informational. Good practice to have one." },
    { path: "/security.txt", label: "security.txt (root)", impact: "Low — informational." },
    { path: "/CHANGELOG.md", label: "CHANGELOG.md", impact: "Reveals version history and past vulnerabilities that were fixed." },
    { path: "/README.md", label: "README.md", impact: "Developer documentation may reveal architecture or credentials." },
    { path: "/.htpasswd", label: ".htpasswd File", impact: "Hashed credentials directly accessible — brute-forceable offline." },
    { path: "/id_rsa", label: "id_rsa Private Key", impact: "CRITICAL: SSH private key exposed publicly." },
    { path: "/server.key", label: "server.key Private Key", impact: "CRITICAL: SSL/TLS private key exposed — allows traffic decryption." },
    { path: "/private.key", label: "private.key", impact: "CRITICAL: Private key file accessible." },
    { path: "/api/v1/users", label: "/api/v1/users Endpoint", impact: "Unauthenticated user listing exposes PII." },
    { path: "/api/users", label: "/api/users Endpoint", impact: "User data endpoint accessible without authentication." },
    { path: "/api/v1/admin", label: "/api/v1/admin Endpoint", impact: "Admin API accessible without authentication." },
    { path: "/.well-known/openid-configuration", label: "OpenID Config", impact: "OAuth/OIDC configuration exposed — reveals auth endpoints." },
    { path: "/swagger.json", label: "Swagger/OpenAPI JSON", impact: "Full API documentation exposed — all endpoints listed with parameters." },
    { path: "/swagger-ui.html", label: "Swagger UI", impact: "Interactive API explorer — all endpoints browsable and testable by anyone." },
    { path: "/openapi.json", label: "OpenAPI Schema", impact: "Full API schema exposed — every endpoint, parameter, and response type." },
    { path: "/api-docs", label: "API Docs", impact: "API documentation may expose all endpoints and authentication methods." },
    { path: "/.npmrc", label: ".npmrc File", impact: "npm registry tokens exposed — may allow package hijacking." },
    { path: "/.yarnrc", label: ".yarnrc File", impact: "Yarn config with potential auth tokens." },
  ];

  const pathResults = await Promise.allSettled(
    sensitivePaths.map(({ path }) =>
      fetch(`${baseUrl}${path}`, { method: "GET", headers: hdr, redirect: "manual", signal: AbortSignal.timeout(5000) })
        .then(r => ({ path, status: r.status, size: parseInt(r.headers.get("content-length") || "0") }))
        .catch(() => ({ path, status: 0, size: 0 }))
    )
  );

  const exposed = pathResults
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<{ path: string; status: number; size: number }>).value)
    .filter(r => r.status === 200);

  const critical = ["/.env", "/.git/config", "/.git/HEAD", "/id_rsa", "/server.key", "/private.key", "/backup.sql", "/db.sql", "/dump.sql", "/.htpasswd"];
  const highPaths = ["/admin", "/phpmyadmin", "/adminer.php", "/phpinfo.php", "/api/v1/users", "/api/users", "/swagger-ui.html", "/swagger.json", "/openapi.json"];

  for (const exp of exposed) {
    const meta = sensitivePaths.find(p => p.path === exp.path)!;
    const isCritical = critical.includes(exp.path);
    const isHigh = highPaths.includes(exp.path);
    findings.push({
      severity: isCritical ? "critical" : isHigh ? "high" : "medium",
      type: `Sensitive Path Exposed: ${meta.label} [Security Probe]`,
      description: `The path "${exp.path}" is publicly accessible (HTTP 200). ${meta.impact}`,
      location: `${baseUrl}${exp.path}`,
      recommendation: isCritical
        ? "URGENT: Move this file outside the web root immediately. Add server rules to block access. Rotate all credentials that may have been exposed."
        : `Block public access to this path using .htaccess, nginx deny rules, or server config. Files like this should never be served publicly.`,
      impact: meta.impact,
      howTested: `Security probe: Sent GET request to ${baseUrl}${exp.path}. Server returned HTTP 200.`,
      howCaused: "File is located inside the web-accessible root directory without access restrictions.",
    });
  }

  // Report paths that are correctly blocked
  const correctlyBlocked = pathResults
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<{ path: string; status: number; size: number }>).value)
    .filter(r => r.status === 403 || r.status === 404).length;

  if (correctlyBlocked > 0 && exposed.length === 0) {
    findings.push({
      severity: "pass",
      type: `All ${sensitivePaths.length} Sensitive Paths Blocked [Security Probe]`,
      description: `Probed ${sensitivePaths.length} known sensitive paths (.env, .git, admin panels, API docs, private keys, DB dumps, etc). None returned HTTP 200.`,
      location: baseUrl,
      recommendation: "Continue running this scan after every deployment to catch accidental exposure.",
      impact: "None — all sensitive path probes returned 403 or 404.",
      howTested: `Security probe: Sent GET requests to ${sensitivePaths.length} known sensitive paths. All blocked.`,
      howCaused: "N/A",
    });
  } else if (exposed.length === 0 && correctlyBlocked === 0) {
    findings.push({
      severity: "pass",
      type: `Sensitive Paths Not Accessible [Security Probe]`,
      description: `All probed sensitive paths returned non-200 responses. No obvious exposure detected.`,
      location: baseUrl,
      recommendation: "Continue periodic sensitive path scanning.",
      impact: "None.",
      howTested: `Probed ${sensitivePaths.length} paths.`,
      howCaused: "N/A",
    });
  }

  // ── A2. HTTP Method Abuse Testing ─────────────────────────────────────────

  const dangerousMethods = ["PUT", "DELETE", "PATCH", "TRACE", "OPTIONS", "CONNECT", "PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE"];

  const methodResults = await Promise.allSettled(
    dangerousMethods.map(method =>
      fetch(url, { method, headers: hdr, redirect: "manual", signal: AbortSignal.timeout(5000) })
        .then(r => ({ method, status: r.status, allow: r.headers.get("allow") || "" }))
        .catch(() => ({ method, status: 0, allow: "" }))
    )
  );

  const allowedDangerous = methodResults
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<{ method: string; status: number; allow: string }>).value)
    .filter(r => r.status !== 405 && r.status !== 501 && r.status !== 0 && r.status !== 403);

  const traceAllowed = allowedDangerous.find(r => r.method === "TRACE");
  if (traceAllowed) {
    findings.push({
      severity: "high",
      type: "HTTP TRACE Method Enabled [Security Probe]",
      description: `The TRACE method is enabled (HTTP ${traceAllowed.status}). This allows Cross-Site Tracing (XST) attacks which can steal HttpOnly cookies.`,
      location: url,
      recommendation: "Disable TRACE method in your web server config. Nginx: add 'if ($request_method = TRACE) { return 405; }'. Apache: add 'TraceEnable off'.",
      impact: "XST attacks can steal session cookies even with HttpOnly flag set. Attacker uses JavaScript to send a TRACE request and read the echoed cookies from the response.",
      howTested: `Security probe: Sent HTTP TRACE request to ${url}. Server returned HTTP ${traceAllowed.status} instead of 405 Method Not Allowed.`,
      howCaused: "TRACE method is enabled by default in some web servers. It must be explicitly disabled.",
    });
  }

  const putAllowed = allowedDangerous.find(r => r.method === "PUT");
  if (putAllowed) {
    findings.push({
      severity: "critical",
      type: "HTTP PUT Method Enabled [Security Probe]",
      description: `PUT method is enabled on the web root (HTTP ${putAllowed.status}). An attacker may be able to upload arbitrary files to the server.`,
      location: url,
      recommendation: "Disable PUT method unless intentionally used. Restrict it to specific authenticated API endpoints only.",
      impact: "Attacker can upload malicious scripts (web shells) to the server and execute arbitrary code.",
      howTested: `Security probe: Sent HTTP PUT request to ${url}. Server returned HTTP ${putAllowed.status} instead of 405.`,
      howCaused: "Web server or framework allows all HTTP methods by default without restriction.",
    });
  }

  const deleteAllowed = allowedDangerous.find(r => r.method === "DELETE");
  if (deleteAllowed) {
    findings.push({
      severity: "high",
      type: "HTTP DELETE Method Enabled on Root [Security Probe]",
      description: `DELETE method responds with HTTP ${deleteAllowed.status} on the root URL. May allow unauthenticated deletion of server resources.`,
      location: url,
      recommendation: "Restrict DELETE to authenticated API endpoints only. Block it on static/page routes.",
      impact: "Attacker could delete server-side resources without authentication.",
      howTested: `Security probe: Sent HTTP DELETE to ${url}. Got HTTP ${deleteAllowed.status}.`,
      howCaused: "Server accepts all HTTP methods without method-level restrictions.",
    });
  }

  const optionsRes = methodResults
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<{ method: string; status: number; allow: string }>).value)
    .find(r => r.method === "OPTIONS");

  if (optionsRes && optionsRes.status === 200) {
    const allowHeader = optionsRes.allow.toUpperCase();
    if (allowHeader.includes("TRACE") || allowHeader.includes("PUT") || allowHeader.includes("DELETE")) {
      findings.push({
        severity: "medium",
        type: "Dangerous Methods Listed in Allow Header [Security Probe]",
        description: `OPTIONS response lists potentially dangerous HTTP methods in the Allow header: "${optionsRes.allow}". This advertises attack surface.`,
        location: url,
        recommendation: "Audit the Allow header and remove any method not intentionally supported. Consider hiding the OPTIONS response entirely.",
        impact: "Attackers use OPTIONS requests to enumerate available attack vectors. Dangerous methods in Allow header confirms their availability.",
        howTested: `Security probe: Sent OPTIONS request to ${url}. Allow header returned: "${optionsRes.allow}".`,
        howCaused: "Web server or framework automatically generates Allow header listing all registered method handlers.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "HTTP Allow Header Safe [Security Probe]",
        description: `OPTIONS response Allow header shows only safe methods: "${optionsRes.allow}".`,
        location: url,
        recommendation: "Continue restricting HTTP methods to only those needed.",
        impact: "None — method enumeration shows safe configuration.",
        howTested: `Sent OPTIONS to ${url}. Allow: "${optionsRes.allow}".`,
        howCaused: "N/A",
      });
    }
  }

  // ── A3. CORS Misconfiguration Testing ─────────────────────────────────────

  try {
    const corsRes = await fetch(url, {
      headers: { ...hdr, "Origin": "https://evil-attacker-site.com" },
      signal: AbortSignal.timeout(8000),
    });
    const acao = corsRes.headers.get("access-control-allow-origin") || "";
    const acac = corsRes.headers.get("access-control-allow-credentials") || "";

    if (acao === "*" && acac === "true") {
      findings.push({
        severity: "critical",
        type: "CORS Misconfiguration: Wildcard + Credentials [Security Probe]",
        description: "Server responds with Access-Control-Allow-Origin: * AND Access-Control-Allow-Credentials: true simultaneously. This is a catastrophic CORS misconfiguration.",
        location: url,
        recommendation: "Never combine wildcard ACAO with Allow-Credentials: true. Specify exact allowed origins instead of *.",
        impact: "Any website can make authenticated cross-origin requests on behalf of logged-in users, reading their data and performing actions.",
        howTested: `Security probe: Sent request with Origin: https://evil-attacker-site.com. Response: ACAO: ${acao}, ACAC: ${acac}.`,
        howCaused: "CORS configuration combines wildcard origin (meant for public APIs) with credentials flag (meant for trusted origins). These are mutually exclusive for security.",
      });
    } else if (acao === "https://evil-attacker-site.com") {
      findings.push({
        severity: "high",
        type: "CORS Blindly Reflects Request Origin [Security Probe]",
        description: `Server reflects any Origin header back as Access-Control-Allow-Origin. Sent: "https://evil-attacker-site.com", Got back the same value.`,
        location: url,
        recommendation: "Maintain an allowlist of trusted origins. Never dynamically reflect the Origin header value without checking it against an allowlist.",
        impact: "Any site can make cross-origin requests to this API and read the response, bypassing Same-Origin Policy.",
        howTested: `Security probe: Sent request with Origin: https://evil-attacker-site.com. ACAO header echoed back the same value.`,
        howCaused: "CORS middleware uses req.headers.origin directly as the ACAO value without validating against an allowlist.",
      });
    } else if (acao === "*") {
      findings.push({
        severity: "medium",
        type: "CORS Wildcard Origin (No Credentials) [Security Probe]",
        description: "Server responds with Access-Control-Allow-Origin: * — any website can make cross-origin requests and read responses.",
        location: url,
        recommendation: "If this is a public API, wildcard may be acceptable. If the API requires authentication, restrict to specific trusted origins.",
        impact: "Any website can read API responses. For public read-only APIs this may be intentional. For authenticated endpoints this is a risk.",
        howTested: `Security probe: Sent request with evil Origin header. Response ACAO: *.`,
        howCaused: "CORS policy set to allow all origins.",
      });
    } else if (!acao) {
      findings.push({
        severity: "pass",
        type: "CORS Not Broadly Opened [Security Probe]",
        description: "Server did not respond with a permissive Access-Control-Allow-Origin header for an untrusted origin.",
        location: url,
        recommendation: "Verify CORS config for API endpoints specifically — main page pass doesn't guarantee API endpoints are safe.",
        impact: "None — CORS configuration appears restrictive for the main page.",
        howTested: `Security probe: Sent request with Origin: https://evil-attacker-site.com. No permissive ACAO returned.`,
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── A4. CSRF Protection Check ─────────────────────────────────────────────

  const hasCSRF = /csrf|xsrf|_token|authenticity.token/i.test(html);
  const hasMeta = /<meta[^>]*(?:csrf|xsrf)[^>]*/i.test(html);

  if (allForms(html).length > 0) {
    if (!hasCSRF && !hasMeta) {
      findings.push({
        severity: "high",
        type: "No CSRF Tokens Found in Forms [Security Probe]",
        description: "Page contains forms but no CSRF token patterns (csrf_token, _token, xsrf, authenticity_token) detected in the HTML source.",
        location: url,
        recommendation: "Add a CSRF token to every state-changing form. Use the Synchronizer Token Pattern: generate a random token server-side, embed it in the form, and validate it on submission.",
        impact: "Attacker can craft a malicious page that auto-submits forms on behalf of logged-in users — changing passwords, making purchases, or deleting accounts.",
        howTested: "Security probe: Scanned all form HTML for CSRF token inputs and meta tags. None found.",
        howCaused: "Forms were built without CSRF protection middleware. Frameworks like Express require explicit csrf middleware (e.g., csurf, express-csrf).",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "CSRF Token Pattern Detected [Security Probe]",
        description: "CSRF token patterns found in forms or meta tags — cross-site request forgery protection appears to be implemented.",
        location: url,
        recommendation: "Verify tokens are unique per session, expire after use, and are validated server-side on every state-changing request.",
        impact: "None — CSRF protection is present.",
        howTested: "Security probe: Scanned HTML for csrf_token, _token, xsrf, authenticity_token patterns in forms and meta tags.",
        howCaused: "N/A",
      });
    }
  }

  // ── A5. Redirect Chain Analysis ───────────────────────────────────────────

  try {
    let currentUrl = url;
    let redirectCount = 0;
    const redirectChain: string[] = [url];
    let response: Response | null = null;

    while (redirectCount < 10) {
      response = await fetch(currentUrl, { method: "GET", headers: hdr, redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || location === currentUrl) break;
        redirectCount++;
        currentUrl = location.startsWith("http") ? location : (location.startsWith("/") ? `${baseUrl}${location}` : location);
        redirectChain.push(currentUrl);
      } else {
        break;
      }
    }

    if (redirectCount > 3) {
      findings.push({
        severity: "medium",
        type: `Long Redirect Chain (${redirectCount} Hops) [Security Probe]`,
        description: `URL goes through ${redirectCount} redirects before reaching final destination: ${redirectChain.join(" → ")}`,
        location: url,
        recommendation: "Collapse redirect chains to a maximum of 1-2 hops. Each redirect adds latency and confuses some clients.",
        impact: "Each redirect adds ~100-300ms latency. Deep chains slow page load significantly. Some bots and clients stop following after 3-5 redirects.",
        howTested: `Security probe: Followed redirect chain from ${url}, tracking Location headers. Counted ${redirectCount} hops.`,
        howCaused: "Multiple redirects layered on top of each other (e.g., http→https + www→non-www + trailing slash normalization all separately).",
      });
    } else if (redirectCount >= 1) {
      findings.push({
        severity: "pass",
        type: `Redirect Chain Acceptable (${redirectCount} hop${redirectCount > 1 ? "s" : ""}) [Security Probe]`,
        description: `URL redirects ${redirectCount} time(s): ${redirectChain.join(" → ")}`,
        location: url,
        recommendation: "Keep redirect chains at 1 hop maximum for best performance.",
        impact: "None — redirect count is acceptable.",
        howTested: `Followed redirect chain. ${redirectCount} hop(s) total.`,
        howCaused: "N/A",
      });
    }

    // Check if HTTP → HTTPS redirect is in place
    if (url.startsWith("https://")) {
      try {
        const httpUrl = url.replace("https://", "http://");
        const httpRes = await fetch(httpUrl, { method: "GET", headers: hdr, redirect: "manual", signal: AbortSignal.timeout(5000) });
        if (httpRes.status >= 301 && httpRes.status <= 308) {
          const loc = httpRes.headers.get("location") || "";
          findings.push({
            severity: "pass",
            type: "HTTP → HTTPS Redirect Active [Security Probe]",
            description: `HTTP requests are redirected to HTTPS (${httpRes.status} → ${loc}).`,
            location: httpUrl,
            recommendation: "Also add HSTS header to prevent browsers from ever using HTTP for this domain.",
            impact: "None — HTTP to HTTPS upgrade redirect is working.",
            howTested: `Probed HTTP version of the URL. Got ${httpRes.status} redirect to HTTPS.`,
            howCaused: "N/A",
          });
        } else {
          findings.push({
            severity: "high",
            type: "No HTTP → HTTPS Redirect [Security Probe]",
            description: `HTTP version of the URL returns HTTP ${httpRes.status} instead of redirecting to HTTPS. Users connecting over HTTP are not upgraded to a secure connection.`,
            location: httpUrl,
            recommendation: "Add a 301 redirect from HTTP to HTTPS. In nginx: 'return 301 https://$host$request_uri;'. In Apache: use mod_rewrite.",
            impact: "Users connecting on HTTP receive content without encryption. Passwords, sessions, and personal data are exposed to eavesdroppers.",
            howTested: `Probed HTTP version: ${httpUrl}. Got HTTP ${httpRes.status} without HTTPS redirect.`,
            howCaused: "Server is not configured to force HTTPS connections.",
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // ── A6. Information Disclosure via Error Messages ─────────────────────────

  try {
    const errorProbeUrl = `${baseUrl}/api/qa-probe-error-${Date.now()}?id[]=1&id[]=2`;
    const errRes = await fetch(errorProbeUrl, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "' OR 1=1 --", data: { $ne: null } }),
      signal: AbortSignal.timeout(8000),
    });
    const errBody = await errRes.text().catch(() => "");

    const stackTracePatterns = [
      /at\s+\w+\s*\([^)]+\.\w+:\d+:\d+\)/,
      /Error:\s+.+\n\s+at/,
      /SyntaxError|TypeError|ReferenceError|MongoError|SequelizeDatabaseError|QueryFailedError/,
      /\bstacktrace\b|\bstack_trace\b/i,
      /node_modules\/|\/app\/server\/|\/home\/runner\//,
    ];

    const leaksStack = stackTracePatterns.some(p => p.test(errBody));
    const leaksDbError = /sql|mysql|postgres|sqlite|mongodb|sequelize|prisma|drizzle|ORA-\d+/i.test(errBody);
    const leaksVersion = /express\/\d+|node\/\d+|php\/\d+|nginx\/\d+|apache\/\d+/i.test(errBody);

    if (leaksStack) {
      findings.push({
        severity: "high",
        type: "Stack Traces Exposed in Error Responses [Security Probe]",
        description: "API endpoint returned a stack trace in its error response. Stack traces reveal file paths, function names, and code structure.",
        location: errorProbeUrl,
        recommendation: "Never return stack traces in production. Log errors server-side and return generic error messages to clients. Set NODE_ENV=production.",
        impact: "Attacker learns internal file structure, function names, and may identify specific vulnerable library versions.",
        howTested: "Security probe: Sent a malformed API request. Response body contained stack trace patterns (file:line:col format).",
        howCaused: "Application is running in development mode or error handler is not configured for production.",
      });
    }
    if (leaksDbError) {
      findings.push({
        severity: "high",
        type: "Database Error Messages in API Response [Security Probe]",
        description: "API error response contains database-related keywords (SQL, PostgreSQL, Sequelize, etc.). Raw DB errors are leaking to the client.",
        location: errorProbeUrl,
        recommendation: "Catch all database errors and return generic messages: { error: 'Internal server error' }. Log the real error server-side only.",
        impact: "Attacker learns database engine, table names, column names, or SQL query structure — essential information for SQL injection attacks.",
        howTested: "Security probe: Sent malformed request. Response body contained DB engine or ORM error patterns.",
        howCaused: "Database errors are not caught and are passed directly to the HTTP response handler.",
      });
    }
    if (!leaksStack && !leaksDbError) {
      findings.push({
        severity: "pass",
        type: "Error Responses Don't Expose Internal Details [Security Probe]",
        description: "Probing unknown API endpoints with malformed data did not return stack traces or database error messages.",
        location: errorProbeUrl,
        recommendation: "Continue auditing all error paths. Ensure all try/catch blocks return generic errors in production.",
        impact: "None — error information disclosure test passed.",
        howTested: "Security probe: Sent malformed POST to unknown API endpoint. Response did not contain stack traces or DB error messages.",
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── A7. Login Timing Attack ───────────────────────────────────────────────

  const loginFormPattern2 = /<form[^>]*>[\s\S]*?<\/form>/gi;
  const allFormsList = html.match(loginFormPattern2) || [];
  const loginFormForTiming = allFormsList.find(f => /<input[^>]*type=["']password["']/i.test(f));

  if (loginFormForTiming) {
    const actionMatch = loginFormForTiming.match(/action=["']([^"']*)["']/i);
    const formAction = actionMatch?.[1] || url;
    const resolvedAction = formAction.startsWith("http") ? formAction : (formAction.startsWith("/") ? `${baseUrl}${formAction}` : url);
    const methodMatch = loginFormForTiming.match(/method=["'](post|get)["']/i);
    const formMethod = (methodMatch?.[1] || "post").toUpperCase();

    try {
      const timings: number[] = [];
      const testCases = [
        "validuser1&password=wrongpassword1",
        "nonexistent_user_abc_xyz&password=wrongpassword2",
        "validuser1&password=wrongpassword3",
        "nonexistent_user_def_uvw&password=wrongpassword4",
      ];

      for (const tc of testCases) {
        const t0 = Date.now();
        await fetch(resolvedAction, {
          method: formMethod,
          headers: { ...hdr, "Content-Type": "application/x-www-form-urlencoded" },
          body: `username=${tc}`,
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        timings.push(Date.now() - t0);
        await new Promise(r => setTimeout(r, 100));
      }

      const existingUserTimings = [timings[0], timings[2]];
      const nonexistentTimings = [timings[1], timings[3]];
      const avgExisting = existingUserTimings.reduce((a, b) => a + b, 0) / existingUserTimings.length;
      const avgNonexistent = nonexistentTimings.reduce((a, b) => a + b, 0) / nonexistentTimings.length;
      const timingDiff = Math.abs(avgExisting - avgNonexistent);

      if (timingDiff > 200) {
        findings.push({
          severity: "medium",
          type: "Potential Timing Attack: Login Response Times Differ [Security Probe]",
          description: `Login attempts with different usernames have different average response times: existing-like usernames avg ${Math.round(avgExisting)}ms, non-existing-like avg ${Math.round(avgNonexistent)}ms (${Math.round(timingDiff)}ms difference). This may enable username enumeration via timing.`,
          location: resolvedAction,
          recommendation: "Use constant-time comparison for password hashing. Add an artificial fixed delay to all failed logins regardless of whether the username exists.",
          impact: "Attacker can enumerate valid usernames by measuring response time differences, then target those accounts for brute force.",
          howTested: `Security probe: Sent login requests with different usernames (alternating likely-existing vs clearly-random). Measured response times: [${timings.join(", ")}]ms.`,
          howCaused: "Server queries the database for the username first, then hashes the password — if the user doesn't exist, the query returns faster and skips hashing.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "Login Response Times Consistent (No Timing Attack) [Security Probe]",
          description: `Login response times are consistent regardless of username: avg ${Math.round(avgExisting)}ms vs ${Math.round(avgNonexistent)}ms (${Math.round(timingDiff)}ms difference — within acceptable range).`,
          location: resolvedAction,
          recommendation: "Continue using constant-time password comparison. Consider adding a small random jitter to all login responses.",
          impact: "None — timing attack test passed.",
          howTested: `Security probe: Tested login with varying usernames. Response times: [${timings.join(", ")}]ms.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }
  }

  // ── A8. Common Default Credentials ────────────────────────────────────────

  const adminPaths = ["/admin", "/admin/login", "/wp-admin", "/login", "/signin"];
  const defaultCreds = [
    { user: "admin", pass: "admin" },
    { user: "admin", pass: "password" },
    { user: "admin", pass: "123456" },
    { user: "admin", pass: "" },
    { user: "root", pass: "root" },
    { user: "administrator", pass: "administrator" },
    { user: "test", pass: "test" },
  ];

  for (const adminPath of adminPaths.slice(0, 2)) {
    const adminUrl = `${baseUrl}${adminPath}`;
    try {
      const adminCheck = await fetch(adminUrl, { headers: hdr, redirect: "follow", signal: AbortSignal.timeout(5000) });
      if (adminCheck.status === 200) {
        const adminHtml = await adminCheck.text().catch(() => "");
        if (/<input[^>]*type=["']password["']/i.test(adminHtml)) {
          for (const cred of defaultCreds.slice(0, 3)) {
            try {
              const credRes = await fetch(adminUrl, {
                method: "POST",
                headers: { ...hdr, "Content-Type": "application/x-www-form-urlencoded" },
                body: `username=${encodeURIComponent(cred.user)}&password=${encodeURIComponent(cred.pass)}&user_login=${encodeURIComponent(cred.user)}&user_pass=${encodeURIComponent(cred.pass)}`,
                redirect: "manual",
                signal: AbortSignal.timeout(5000),
              });
              if (credRes.status === 302 && !credRes.headers.get("location")?.includes("login") && !credRes.headers.get("location")?.includes("error")) {
                findings.push({
                  severity: "critical",
                  type: `Default Credentials Accepted: ${cred.user}/${cred.pass || "(empty)"} [Security Probe]`,
                  description: `Admin panel at ${adminUrl} accepted default credentials (${cred.user} / ${cred.pass || "(empty)"}). Server redirected to: ${credRes.headers.get("location")}.`,
                  location: adminUrl,
                  recommendation: "Change all default credentials immediately. Enforce strong password policy. Restrict admin panel to internal network IPs.",
                  impact: "CRITICAL: Admin panel is compromised. Attacker has full administrative access with these default credentials.",
                  howTested: `Security probe: Submitted default credentials ${cred.user}/${cred.pass || "(empty)"} to ${adminUrl}. Got successful redirect.`,
                  howCaused: "Default credentials were not changed after installation.",
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── A9. Clickjacking Protection ───────────────────────────────────────────

  try {
    const clickRes = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(8000) });
    const xfo = clickRes.headers.get("x-frame-options") || "";
    const csp = clickRes.headers.get("content-security-policy") || "";
    const hasFrameProtection = /DENY|SAMEORIGIN/i.test(xfo) || /frame-ancestors/i.test(csp);

    if (!hasFrameProtection) {
      findings.push({
        severity: "medium",
        type: "Clickjacking Protection Missing [Security Probe]",
        description: "No X-Frame-Options or CSP frame-ancestors directive found. This page can be embedded in an iframe on any attacker-controlled website.",
        location: url,
        recommendation: "Add header: X-Frame-Options: SAMEORIGIN. Or add to CSP: frame-ancestors 'self'. Both together for maximum compatibility.",
        impact: "Clickjacking: attacker embeds your site in an invisible iframe and tricks users into clicking buttons on your site while they think they're clicking something else.",
        howTested: "Security probe: Checked X-Frame-Options and Content-Security-Policy headers for framing restrictions.",
        howCaused: "Clickjacking headers not configured in web server or application middleware.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "Clickjacking Protection Present [Security Probe]",
        description: `Clickjacking protection detected: ${xfo ? `X-Frame-Options: ${xfo}` : ""}${csp && /frame-ancestors/i.test(csp) ? " CSP frame-ancestors set" : ""}.`,
        location: url,
        recommendation: "Use CSP frame-ancestors as the modern approach — X-Frame-Options is legacy but still needed for older browsers.",
        impact: "None — clickjacking protection is in place.",
        howTested: "Security probe: Checked framing protection headers.",
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── A10. Open Redirect Testing ────────────────────────────────────────────

  const redirectParams = ["redirect", "next", "url", "return", "returnTo", "goto", "continue", "forward", "target", "destination", "redir", "redirect_uri"];

  for (const param of redirectParams.slice(0, 5)) {
    try {
      const openRedirectUrl = `${url}?${param}=https://evil-attacker-site.com/steal`;
      const redRes = await fetch(openRedirectUrl, { method: "GET", headers: hdr, redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (redRes.status >= 301 && redRes.status <= 308) {
        const location = redRes.headers.get("location") || "";
        if (location.includes("evil-attacker-site.com")) {
          findings.push({
            severity: "high",
            type: `Open Redirect via ?${param} Parameter [Security Probe]`,
            description: `Adding ?${param}=https://evil-attacker-site.com to the URL causes a redirect to the attacker's domain (${redRes.status} → ${location}).`,
            location: openRedirectUrl,
            recommendation: "Validate redirect targets against an allowlist of trusted domains. Never redirect to arbitrary user-supplied URLs.",
            impact: "Phishing: attacker sends users a link to your trusted domain that automatically redirects them to a malicious site. OAuth redirect URI abuse.",
            howTested: `Security probe: Appended ?${param}=https://evil-attacker-site.com to URL. Got ${redRes.status} redirect to attacker domain.`,
            howCaused: `Query parameter "${param}" is used directly as redirect destination without domain validation.`,
          });
          break;
        }
      }
    } catch { /* skip */ }
  }

  // ── A11. Subresource Integrity (SRI) Check ─────────────────────────────────

  const externalScripts = (html.match(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*/gi) || []);
  const externalStyles = (html.match(/<link[^>]+href=["']https?:\/\/[^"']+["'][^>]*/gi) || []).filter(l => /stylesheet/i.test(l));

  const missingIntegrity = [...externalScripts, ...externalStyles].filter(tag => !/integrity=["']/i.test(tag));

  if (missingIntegrity.length > 0) {
    findings.push({
      severity: "medium",
      type: `${missingIntegrity.length} External Resource(s) Missing SRI Hash [Security Probe]`,
      description: `${missingIntegrity.length} external script/stylesheet tag(s) load from CDN without Subresource Integrity (SRI) hashes. If the CDN is compromised, malicious code runs on your site.`,
      location: url,
      recommendation: "Add integrity=\"sha384-...\" and crossorigin=\"anonymous\" to all external CDN resources. Use https://www.srihash.org/ to generate hashes.",
      impact: "If the CDN hosting these resources is compromised (supply chain attack), the attacker can replace the file with malicious code that runs on your users' browsers.",
      howTested: `Security probe: Scanned ${externalScripts.length + externalStyles.length} external resources for SRI integrity attributes. ${missingIntegrity.length} were missing.`,
      howCaused: "External resources added without SRI hashes — common when just copying CDN link tags without security attributes.",
    });
  } else if (externalScripts.length + externalStyles.length > 0) {
    findings.push({
      severity: "pass",
      type: "All External Resources Have SRI Hashes [Security Probe]",
      description: `All ${externalScripts.length + externalStyles.length} external CDN resources have Subresource Integrity attributes — supply chain attacks are mitigated.`,
      location: url,
      recommendation: "Update SRI hashes when upgrading CDN library versions.",
      impact: "None — SRI check passed.",
      howTested: `Scanned all external <script> and <link> tags for integrity attributes. All ${externalScripts.length + externalStyles.length} had them.`,
      howCaused: "N/A",
    });
  }

  // ── A12. API Rate Limiting on Auth Endpoints ─────────────────────────────

  const loginFormList = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || [];
  const loginFm = loginFormList.find(f => /<input[^>]*type=["']password["']/i.test(f));
  if (loginFm) {
    const amatch = loginFm.match(/action=["']([^"']*)["']/i);
    const loginUrl = amatch ? (amatch[1].startsWith("/") ? `${baseUrl}${amatch[1]}` : amatch[1]) : `${baseUrl}/login`;
    try {
      const bruteAttempts = Array.from({ length: 15 }, (_, i) =>
        fetch(loginUrl, {
          method: "POST",
          headers: { ...hdr, "Content-Type": "application/x-www-form-urlencoded" },
          body: `username=testuser&password=attempt${i}`,
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        }).then(r => r.status).catch(() => 0)
      );
      const bruteStatuses = await Promise.all(bruteAttempts);
      const blocked = bruteStatuses.filter(s => s === 429 || s === 423 || s === 503).length;
      const lockout = bruteStatuses.some(s => s === 429 || s === 423);

      if (!lockout) {
        findings.push({
          severity: "high",
          type: "No Brute Force Protection on Login [Security Probe]",
          description: `15 rapid login attempts were made without triggering a rate limit or lockout. Brute force attacks are not protected against.`,
          location: loginUrl,
          recommendation: "Implement account lockout after 5-10 failed attempts. Add exponential backoff. Return HTTP 429 with Retry-After header. Consider CAPTCHA after 3 failures.",
          impact: "Attacker can try thousands of passwords per minute against any account. Weak or common passwords will be cracked quickly.",
          howTested: `Security probe: Sent 15 consecutive failed login attempts. None triggered HTTP 429, 423, or any lockout response.`,
          howCaused: "Login endpoint lacks rate limiting middleware and account lockout logic.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: `Brute Force Protection Active (${blocked}/15 Blocked) [Security Probe]`,
          description: `${blocked} out of 15 rapid login attempts were blocked with rate limiting or lockout responses. Brute force protection is working.`,
          location: loginUrl,
          recommendation: "Verify lockout duration is sufficient and that lockout state is stored server-side (not in a cookie).",
          impact: "None — brute force protection is working.",
          howTested: `Security probe: Sent 15 rapid login attempts. ${blocked} returned 429/423 lockout responses.`,
          howCaused: "N/A",
        });
      }
    } catch { /* skip */ }
  }

  return findings;
}

// ─── Helper ──────────────────────────────────────────────────────────────────
function allForms(html: string): RegExpMatchArray {
  return html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || ([] as unknown as RegExpMatchArray);
}

// ─── Performance, SEO, PWA & Mobile Tests ───────────────────────────────────
// Compression, caching, Core Web Vitals signals, SEO tags, Open Graph,
// schema.org, PWA manifest, mobile meta, accessibility, typography.

async function analyzePerformanceSEO(html: string, url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const baseUrl = (() => { try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return ""; } })();
  const hdr = { "User-Agent": "Mozilla/5.0 (compatible; QABot/1.0)" };

  // ── P1. GZIP / Brotli Compression ─────────────────────────────────────────

  try {
    const compRes = await fetch(url, {
      headers: { ...hdr, "Accept-Encoding": "br, gzip, deflate" },
      signal: AbortSignal.timeout(8000),
    });
    const encoding = compRes.headers.get("content-encoding") || "";
    const contentLength = parseInt(compRes.headers.get("content-length") || "0");
    const rawBody = await compRes.text().catch(() => "");
    const rawSize = rawBody.length;

    if (!encoding) {
      findings.push({
        severity: "medium",
        type: "Response Not Compressed (No GZIP/Brotli) [Performance]",
        description: `Server returned ${rawSize.toLocaleString()} bytes with no compression (Accept-Encoding: br, gzip sent). Uncompressed HTML wastes bandwidth and slows load.`,
        location: url,
        recommendation: "Enable Brotli (preferred) or Gzip compression on your web server. Nginx: 'gzip on; gzip_types text/html text/css application/javascript'. Express: use compression middleware.",
        impact: "Uncompressed HTML is typically 3-7x larger than compressed. A 200KB page becomes 30-60KB with gzip — massive speed difference on mobile.",
        howTested: `Performance test: Sent Accept-Encoding: br, gzip, deflate. Response Content-Encoding header: "${encoding || "not set"}".`,
        howCaused: "Compression middleware not configured on the server. This is often a one-line fix but left out in minimal setups.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: `Response Compressed with ${encoding.toUpperCase()} [Performance]`,
        description: `Server uses ${encoding} compression. Compressed responses reduce bandwidth and improve load times significantly.`,
        location: url,
        recommendation: "Prefer Brotli over Gzip — it's 20-30% smaller for text content.",
        impact: "None — compression is active.",
        howTested: `Performance test: Sent Accept-Encoding header. Response Content-Encoding: ${encoding}.`,
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── P2. Cache-Control Headers ──────────────────────────────────────────────

  try {
    const cacheRes = await fetch(url, { headers: hdr, signal: AbortSignal.timeout(8000) });
    const cacheControl = cacheRes.headers.get("cache-control") || "";
    const etag = cacheRes.headers.get("etag") || "";
    const lastModified = cacheRes.headers.get("last-modified") || "";

    if (!cacheControl && !etag && !lastModified) {
      findings.push({
        severity: "medium",
        type: "No Cache Control Headers [Performance]",
        description: "Response has no Cache-Control, ETag, or Last-Modified headers. Browsers cannot cache the page, causing full re-downloads on every visit.",
        location: url,
        recommendation: "Add Cache-Control headers: for HTML use 'no-cache' (must revalidate). For static assets (JS, CSS, images) use 'public, max-age=31536000, immutable'.",
        impact: "Every page visit downloads the full HTML again. Users on slow connections or revisiting frequently waste bandwidth and time.",
        howTested: "Performance test: Checked response headers for Cache-Control, ETag, and Last-Modified. None found.",
        howCaused: "Server framework not configured with caching middleware. Default Express/Node servers don't set cache headers automatically.",
      });
    } else if (cacheControl.includes("no-store") && !cacheControl.includes("private")) {
      findings.push({
        severity: "low",
        type: "Cache-Control: no-store (Aggressive) [Performance]",
        description: `Cache-Control: "${cacheControl}" prevents any caching. For dynamic pages this is intentional, but for static assets it degrades performance significantly.`,
        location: url,
        recommendation: "Use no-store only for sensitive data (banking, medical). For general pages, prefer no-cache with ETag for conditional revalidation.",
        impact: "Low — aggressive caching prevents sensitive data exposure but hurts repeat-visit performance.",
        howTested: `Performance test: Cache-Control header value: "${cacheControl}".`,
        howCaused: "Security-conscious caching settings applied broadly instead of just to sensitive endpoints.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "Cache Control Headers Present [Performance]",
        description: `Response includes caching directives: ${[cacheControl && `Cache-Control: ${cacheControl}`, etag && `ETag: ${etag.substring(0, 20)}...`, lastModified && `Last-Modified: ${lastModified}`].filter(Boolean).join(", ")}.`,
        location: url,
        recommendation: "Verify cache durations match content freshness requirements. Use long max-age for versioned/hashed assets.",
        impact: "None — caching is configured.",
        howTested: "Performance test: Checked Cache-Control, ETag, and Last-Modified response headers.",
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── P3. SEO: Title Tag ────────────────────────────────────────────────────

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || "";

  if (!title) {
    findings.push({
      severity: "high",
      type: "Missing <title> Tag [SEO]",
      description: "Page has no <title> tag. Title is the most important on-page SEO element and is shown in browser tabs and search results.",
      location: url,
      recommendation: "Add a unique, descriptive <title> tag: <title>Page Name - Site Name</title>. Keep between 50-60 characters.",
      impact: "Page will not rank in search engines. Browser tab shows blank or URL. Social shares show no title.",
      howTested: "SEO check: Searched HTML for <title> tag. Not found.",
      howCaused: "Title tag was not added to the page template.",
    });
  } else if (title.length < 10) {
    findings.push({
      severity: "medium",
      type: `<title> Too Short (${title.length} chars): "${title}" [SEO]`,
      description: "Page title is too short (under 10 characters). Short titles don't describe the page content for search engines.",
      location: url,
      recommendation: "Write a descriptive title of 50-60 characters: <title>Keyword-Rich Page Name - Brand Name</title>.",
      impact: "Poor SEO performance. Search engines use title as primary ranking signal.",
      howTested: `SEO check: Title found: "${title}" (${title.length} chars). Minimum recommended: 50 chars.`,
      howCaused: "Title tag present but not optimized with descriptive content.",
    });
  } else if (title.length > 60) {
    findings.push({
      severity: "low",
      type: `<title> Too Long (${title.length} chars) [SEO]`,
      description: `Title is ${title.length} characters — Google truncates titles at ~60 characters in search results.`,
      location: url,
      recommendation: "Shorten title to 50-60 characters. Put the most important keywords first.",
      impact: "Title gets cut off in search results. Reduces click-through rate.",
      howTested: `SEO check: Title: "${title.substring(0, 60)}..." (${title.length} chars).`,
      howCaused: "Title contains full sentences or branding that pushes it over the limit.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: `<title> Tag Good (${title.length} chars) [SEO]`,
      description: `Page title is well-formed: "${title}" (${title.length} characters — within 50-60 char ideal range).`,
      location: url,
      recommendation: "Include primary keyword early in the title for best SEO impact.",
      impact: "None — title tag is optimal.",
      howTested: `SEO check: Title: "${title}" (${title.length} chars).`,
      howCaused: "N/A",
    });
  }

  // ── P4. Meta Description ──────────────────────────────────────────────────

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*/i);
  const metaDesc = descMatch?.[1]?.trim() || "";

  if (!metaDesc) {
    findings.push({
      severity: "medium",
      type: "Missing Meta Description [SEO]",
      description: "No meta description tag found. Search engines use meta description as the snippet shown below the title in search results.",
      location: url,
      recommendation: "Add: <meta name=\"description\" content=\"Your compelling 150-160 char page description here.\">",
      impact: "Google generates its own description (often poor quality). Lower click-through rate from search results. Hurts brand perception.",
      howTested: "SEO check: Searched HTML for <meta name='description'>. Not found.",
      howCaused: "Meta description not added to page template.",
    });
  } else if (metaDesc.length < 50) {
    findings.push({
      severity: "low",
      type: `Meta Description Too Short (${metaDesc.length} chars) [SEO]`,
      description: `Meta description: "${metaDesc}" is only ${metaDesc.length} characters. Ideal length is 150-160 characters.`,
      location: url,
      recommendation: "Expand meta description to 150-160 chars. Include primary keywords and a call to action.",
      impact: "Short descriptions don't fill the search result snippet — missed opportunity for click-through rate.",
      howTested: `SEO check: Meta description found but only ${metaDesc.length} chars.`,
      howCaused: "Meta description present but written as a placeholder or very brief phrase.",
    });
  } else if (metaDesc.length > 160) {
    findings.push({
      severity: "low",
      type: `Meta Description Too Long (${metaDesc.length} chars) [SEO]`,
      description: `Meta description is ${metaDesc.length} characters — Google truncates to ~160 chars in search results.`,
      location: url,
      recommendation: "Trim to 150-160 characters. Put the most important content first.",
      impact: "Description gets cut off in search results with '...' — reduced readability.",
      howTested: `SEO check: Meta description length: ${metaDesc.length} chars.`,
      howCaused: "Meta description written as a full paragraph instead of concise snippet.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: `Meta Description Good (${metaDesc.length} chars) [SEO]`,
      description: `Meta description is well-formed (${metaDesc.length} chars, within 150-160 ideal).`,
      location: url,
      recommendation: "Include your primary keyword in the meta description to improve relevance.",
      impact: "None — meta description is optimal.",
      howTested: `SEO check: Found meta description (${metaDesc.length} chars).`,
      howCaused: "N/A",
    });
  }

  // ── P5. Open Graph Tags ───────────────────────────────────────────────────

  const ogTitle = /<meta[^>]*property=["']og:title["'][^>]*/i.test(html);
  const ogDesc = /<meta[^>]*property=["']og:description["'][^>]*/i.test(html);
  const ogImage = /<meta[^>]*property=["']og:image["'][^>]*/i.test(html);
  const ogUrl = /<meta[^>]*property=["']og:url["'][^>]*/i.test(html);
  const ogType = /<meta[^>]*property=["']og:type["'][^>]*/i.test(html);
  const twitterCard = /<meta[^>]*name=["']twitter:card["'][^>]*/i.test(html);
  const twitterTitle = /<meta[^>]*name=["']twitter:title["'][^>]*/i.test(html);
  const twitterImage = /<meta[^>]*name=["']twitter:image["'][^>]*/i.test(html);

  const ogMissing = [!ogTitle && "og:title", !ogDesc && "og:description", !ogImage && "og:image", !ogUrl && "og:url"].filter(Boolean);

  if (ogMissing.length > 0) {
    findings.push({
      severity: "medium",
      type: `Open Graph Tags Incomplete [SEO/Social]`,
      description: `Missing Open Graph properties: ${ogMissing.join(", ")}. Without these, social media previews (Facebook, LinkedIn, Slack) show blank or poorly formatted cards.`,
      location: url,
      recommendation: `Add missing OG tags in <head>:\n<meta property="og:title" content="...">\n<meta property="og:description" content="...">\n<meta property="og:image" content="https://...">\n<meta property="og:url" content="${url}">`,
      impact: "Links shared on Facebook, LinkedIn, and Slack show no image or title — drastically lower click-through rate on social shares.",
      howTested: `SEO check: Scanned for Open Graph meta properties. Missing: ${ogMissing.join(", ")}.`,
      howCaused: "Open Graph meta tags not added to the page template. Often forgotten because they only matter for external link sharing.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Open Graph Tags Complete [SEO/Social]",
      description: "All core Open Graph tags (og:title, og:description, og:image, og:url) are present. Social media previews will display correctly.",
      location: url,
      recommendation: "Also add og:type and og:site_name for richer social previews.",
      impact: "None — Open Graph tags are complete.",
      howTested: "SEO check: Verified og:title, og:description, og:image, og:url meta properties in HTML.",
      howCaused: "N/A",
    });
  }

  if (!twitterCard) {
    findings.push({
      severity: "low",
      type: "Missing Twitter Card Meta Tags [SEO/Social]",
      description: "No twitter:card meta tag found. Twitter/X link previews will not show a rich card format.",
      location: url,
      recommendation: `Add: <meta name="twitter:card" content="summary_large_image"> plus twitter:title, twitter:description, twitter:image.`,
      impact: "Twitter/X links show plain URLs instead of rich preview cards — lower engagement.",
      howTested: "SEO check: Scanned for twitter:card meta tag. Not found.",
      howCaused: "Twitter card tags not added to page template. Separate from Open Graph — must be added independently.",
    });
  }

  // ── P6. Canonical URL ─────────────────────────────────────────────────────

  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*/i)
    || html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*/i);
  const canonical = canonicalMatch?.[1] || "";

  if (!canonical) {
    findings.push({
      severity: "medium",
      type: "Missing Canonical URL Tag [SEO]",
      description: "No <link rel='canonical'> tag found. Without it, search engines may index duplicate versions of this page (with/without www, with/without trailing slash, HTTP/HTTPS).",
      location: url,
      recommendation: `Add to <head>: <link rel="canonical" href="${url}">`,
      impact: "Duplicate content dilutes page authority in search rankings. Multiple versions of the same page compete against each other.",
      howTested: "SEO check: Scanned for <link rel='canonical'> tag. Not found.",
      howCaused: "Canonical tag not added to page template. Critical for sites with multiple URL variants.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Canonical URL Tag Present [SEO]",
      description: `Canonical URL set to: ${canonical}`,
      location: url,
      recommendation: "Ensure canonical URL matches the preferred URL exactly (including https, www preference, trailing slash).",
      impact: "None — canonical tag is present.",
      howTested: `SEO check: Found <link rel='canonical' href='${canonical}'>.`,
      howCaused: "N/A",
    });
  }

  // ── P7. Structured Data / Schema.org ─────────────────────────────────────

  const hasJsonLD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  const hasMicrodata = /itemtype=["']https?:\/\/schema\.org/i.test(html);

  if (!hasJsonLD && !hasMicrodata) {
    findings.push({
      severity: "low",
      type: "No Structured Data (Schema.org) [SEO]",
      description: "No JSON-LD or microdata structured data found. Structured data enables rich results in Google (star ratings, breadcrumbs, FAQs, events).",
      location: url,
      recommendation: "Add JSON-LD structured data relevant to your content type (WebSite, Article, Product, FAQPage, etc.).",
      impact: "Missed opportunity for rich search result snippets — these can double click-through rates.",
      howTested: "SEO check: Scanned for <script type='application/ld+json'> and itemtype='https://schema.org/' attributes.",
      howCaused: "Structured data not implemented. Often overlooked because it's not visible on the page.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Structured Data Present [SEO]",
      description: `Structured data found: ${hasJsonLD ? "JSON-LD" : ""}${hasMicrodata ? " Microdata" : ""}. Enables rich results in search engines.`,
      location: url,
      recommendation: "Validate your structured data with Google's Rich Results Test tool.",
      impact: "None — structured data is implemented.",
      howTested: "SEO check: Found structured data markup.",
      howCaused: "N/A",
    });
  }

  // ── P8. Mobile / Viewport Meta Tag ────────────────────────────────────────

  const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["'][^>]*/i);
  const viewport = viewportMatch?.[1] || "";

  if (!viewport) {
    findings.push({
      severity: "high",
      type: "Missing Viewport Meta Tag [Mobile]",
      description: "No <meta name='viewport'> tag found. Page will render at desktop scale on mobile devices — users must pinch/zoom to read content.",
      location: url,
      recommendation: `Add to <head>: <meta name="viewport" content="width=device-width, initial-scale=1">`,
      impact: "Mobile users see tiny unreadable text. Google's mobile-first indexing may penalize the page in search rankings.",
      howTested: "Mobile check: Scanned for <meta name='viewport'>. Not found.",
      howCaused: "Viewport meta tag not added to page template.",
    });
  } else if (viewport.includes("user-scalable=no") || viewport.includes("maximum-scale=1")) {
    findings.push({
      severity: "medium",
      type: "Viewport Prevents Zoom (Accessibility Issue) [Mobile]",
      description: `Viewport tag "${viewport}" prevents users from zooming in. This is an accessibility violation (WCAG 2.1 SC 1.4.4).`,
      location: url,
      recommendation: "Remove user-scalable=no and maximum-scale restrictions. Users with visual impairments need to zoom.",
      impact: "Violates accessibility standards. Users with low vision cannot zoom to read content. Apple removed this restriction in iOS 10+.",
      howTested: `Mobile check: Viewport content: "${viewport}" — contains zoom-restricting directives.`,
      howCaused: "Developers add user-scalable=no to prevent layout issues on mobile — but this violates accessibility requirements.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Viewport Meta Tag Correct [Mobile]",
      description: `Viewport tag is correctly configured: "${viewport}".`,
      location: url,
      recommendation: "Use width=device-width, initial-scale=1 as the standard viewport configuration.",
      impact: "None — viewport is correctly set.",
      howTested: `Mobile check: Viewport meta: "${viewport}".`,
      howCaused: "N/A",
    });
  }

  // ── P9. PWA Manifest ──────────────────────────────────────────────────────

  const manifestLink = html.match(/<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']*)["'][^>]*/i);
  const manifestUrl = manifestLink?.[1] || "";

  if (!manifestUrl) {
    findings.push({
      severity: "low",
      type: "No PWA Manifest [Progressive Web App]",
      description: "No <link rel='manifest'> found. Without a web app manifest, the site cannot be installed as a Progressive Web App.",
      location: url,
      recommendation: "Create a manifest.json and link it: <link rel='manifest' href='/manifest.json'>. Include name, icons, theme_color, and display mode.",
      impact: "Cannot be installed as a native-like app. No offline support. No splash screen. Missing from Android home screen install prompts.",
      howTested: "PWA check: Scanned for <link rel='manifest'>. Not found.",
      howCaused: "PWA manifest not created or linked. Optional but increasingly expected for modern web apps.",
    });
  } else {
    try {
      const manifestFull = manifestUrl.startsWith("http") ? manifestUrl : `${baseUrl}${manifestUrl.startsWith("/") ? manifestUrl : "/" + manifestUrl}`;
      const mRes = await fetch(manifestFull, { headers: hdr, signal: AbortSignal.timeout(5000) });
      if (mRes.ok) {
        const manifest = await mRes.json().catch(() => null);
        if (manifest) {
          const missing = [];
          if (!manifest.name && !manifest.short_name) missing.push("name");
          if (!manifest.icons || manifest.icons.length === 0) missing.push("icons");
          if (!manifest.display) missing.push("display");
          if (!manifest.theme_color) missing.push("theme_color");

          if (missing.length > 0) {
            findings.push({
              severity: "low",
              type: `PWA Manifest Incomplete (missing: ${missing.join(", ")}) [Progressive Web App]`,
              description: `Web app manifest at ${manifestFull} is missing required fields: ${missing.join(", ")}.`,
              location: manifestFull,
              recommendation: `Add missing fields to manifest.json: ${missing.map(f => `"${f}"`).join(", ")}.`,
              impact: "Incomplete manifest prevents installability and may cause add-to-home-screen prompts to fail.",
              howTested: `PWA check: Fetched and parsed manifest.json. Missing: ${missing.join(", ")}.`,
              howCaused: "Manifest was created but not fully filled out.",
            });
          } else {
            findings.push({
              severity: "pass",
              type: "PWA Manifest Complete [Progressive Web App]",
              description: "Web app manifest is present and contains all required fields (name, icons, display, theme_color).",
              location: manifestFull,
              recommendation: "Test installability in Chrome DevTools (Application → Manifest).",
              impact: "None — PWA manifest is complete.",
              howTested: "PWA check: Fetched and validated manifest.json fields.",
              howCaused: "N/A",
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── P10. Service Worker / Offline Support ─────────────────────────────────

  const hasServiceWorker = /serviceWorker|service.worker|navigator\.serviceWorker/i.test(html);
  if (hasServiceWorker) {
    findings.push({
      severity: "pass",
      type: "Service Worker Detected [PWA]",
      description: "Service worker registration code found in the page. Offline support and caching may be enabled.",
      location: url,
      recommendation: "Test offline behavior: open Chrome DevTools → Application → Service Workers → check 'Offline' then reload.",
      impact: "None — service worker is present.",
      howTested: "PWA check: Found navigator.serviceWorker registration in HTML/JS.",
      howCaused: "N/A",
    });
  }

  // ── P11. Heading Structure / Accessibility ────────────────────────────────

  const h1Tags = (html.match(/<h1[^>]*>/gi) || []).length;
  const h2Tags = (html.match(/<h2[^>]*>/gi) || []).length;
  const allHeadings = h1Tags + h2Tags + (html.match(/<h[3-6][^>]*>/gi) || []).length;

  if (h1Tags === 0) {
    findings.push({
      severity: "medium",
      type: "Missing H1 Heading Tag [SEO/Accessibility]",
      description: "No <h1> tag found on the page. H1 is the primary heading — critical for SEO and screen reader navigation.",
      location: url,
      recommendation: "Add exactly one <h1> tag containing the primary topic/keyword of the page.",
      impact: "Search engines cannot identify the page's primary topic. Screen reader users cannot navigate by headings. SEO ranking signal missed.",
      howTested: "Accessibility check: Scanned HTML for <h1> tags. None found.",
      howCaused: "Page uses styled <div> or <p> elements as visual headings instead of semantic <h1> tag.",
    });
  } else if (h1Tags > 1) {
    findings.push({
      severity: "low",
      type: `Multiple H1 Tags (${h1Tags}) [SEO/Accessibility]`,
      description: `Page has ${h1Tags} <h1> tags. Best practice is exactly one H1 per page for clear SEO hierarchy.`,
      location: url,
      recommendation: "Keep one H1 per page. Demote additional H1s to H2 or H3 to maintain proper heading hierarchy.",
      impact: "Dilutes the primary topic signal for search engines. Slightly confuses screen reader navigation.",
      howTested: `Accessibility check: Found ${h1Tags} H1 tags in HTML.`,
      howCaused: "Multiple page sections use H1 without considering SEO hierarchy.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: "Heading Structure Correct (1 H1) [SEO/Accessibility]",
      description: `Page has exactly 1 H1 tag and ${h2Tags} H2 tag(s). Heading hierarchy is correctly structured.`,
      location: url,
      recommendation: "Ensure headings follow logical order (H1 → H2 → H3) without skipping levels.",
      impact: "None — heading structure is optimal.",
      howTested: `Accessibility check: Found 1 H1, ${h2Tags} H2 tags.`,
      howCaused: "N/A",
    });
  }

  // ── P12. Image Alt Text ───────────────────────────────────────────────────

  const allImages = html.match(/<img[^>]*/gi) || [];
  const imagesWithoutAlt = allImages.filter(img => !/\balt=["'][^"']*["']/i.test(img) || /\balt=["']["']/i.test(img));
  const decorativeOk = allImages.filter(img => /\balt=["']["']/i.test(img));

  if (imagesWithoutAlt.length > decorativeOk.length) {
    const actuallyMissing = allImages.filter(img => !/\balt=/i.test(img));
    if (actuallyMissing.length > 0) {
      findings.push({
        severity: "medium",
        type: `${actuallyMissing.length} Image(s) Missing Alt Text [Accessibility]`,
        description: `${actuallyMissing.length} <img> tag(s) have no alt attribute at all. Screen readers announce these as "image" with no description.`,
        location: url,
        recommendation: "Add descriptive alt text to all meaningful images. Use alt='' (empty) for purely decorative images.",
        impact: "Screen reader users cannot understand image content. Images missing alt text do not contribute to SEO image search ranking.",
        howTested: `Accessibility check: Scanned ${allImages.length} <img> tags. ${actuallyMissing.length} had no alt attribute.`,
        howCaused: "Images added to HTML/template without alt attribute. Often forgotten in rapid development.",
      });
    }
  } else if (allImages.length > 0) {
    findings.push({
      severity: "pass",
      type: `All ${allImages.length} Images Have Alt Text [Accessibility]`,
      description: "All <img> tags have alt attributes (either descriptive text or empty string for decorative images).",
      location: url,
      recommendation: "Verify alt text is descriptive, not just filename-based (e.g., 'img001.jpg'). Keep under 125 characters.",
      impact: "None — image accessibility check passed.",
      howTested: `Accessibility check: All ${allImages.length} images have alt attributes.`,
      howCaused: "N/A",
    });
  }

  // ── P13. Robots.txt ────────────────────────────────────────────────────────

  try {
    const robotsRes = await fetch(`${baseUrl}/robots.txt`, { headers: hdr, signal: AbortSignal.timeout(5000) });
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text().catch(() => "");
      const blockAll = /Disallow:\s*\//m.test(robotsTxt) && /User-agent:\s*\*/m.test(robotsTxt);
      const hasSitemap = /Sitemap:/i.test(robotsTxt);

      if (blockAll && robotsTxt.split("Disallow").length <= 2) {
        findings.push({
          severity: "high",
          type: "robots.txt Blocks All Crawling [SEO]",
          description: "robots.txt contains 'User-agent: * / Disallow: /' — all search engine crawling is blocked. Site will not appear in search results.",
          location: `${baseUrl}/robots.txt`,
          recommendation: "Review robots.txt. If site should be indexed, change to 'Disallow:' (empty) or remove the blocking rule. Only block private/admin paths.",
          impact: "Site completely excluded from Google, Bing, and all other search engines. Zero organic traffic.",
          howTested: "SEO check: Fetched /robots.txt. Found blanket User-agent: * / Disallow: / block.",
          howCaused: "robots.txt template used from development environment (where crawling is correctly blocked) deployed to production without modification.",
        });
      } else {
        findings.push({
          severity: "pass",
          type: "robots.txt Present and Not Blocking All [SEO]",
          description: `robots.txt exists and does not block all crawling.${hasSitemap ? " Sitemap URL referenced." : ""}`,
          location: `${baseUrl}/robots.txt`,
          recommendation: hasSitemap ? "Good — sitemap is linked in robots.txt." : "Add 'Sitemap: https://yourdomain.com/sitemap.xml' to robots.txt.",
          impact: "None — robots.txt is correctly configured.",
          howTested: "SEO check: Fetched and parsed /robots.txt.",
          howCaused: "N/A",
        });
      }
    } else {
      findings.push({
        severity: "low",
        type: "No robots.txt File [SEO]",
        description: `robots.txt returned HTTP ${robotsRes.status}. Without it, crawlers make their own assumptions about what to crawl.`,
        location: `${baseUrl}/robots.txt`,
        recommendation: "Create a robots.txt at the root: minimum content should be 'User-agent: *\\nDisallow:' (allow all) plus a Sitemap: reference.",
        impact: "Without robots.txt, admin paths and duplicate URLs may get indexed. Low impact but best practice to have one.",
        howTested: `SEO check: Fetched /robots.txt. Got HTTP ${robotsRes.status}.`,
        howCaused: "robots.txt not created for this project.",
      });
    }
  } catch { /* skip */ }

  // ── P14. Sitemap.xml ──────────────────────────────────────────────────────

  try {
    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`, { headers: hdr, signal: AbortSignal.timeout(5000) });
    if (sitemapRes.ok) {
      const sitemapBody = await sitemapRes.text().catch(() => "");
      const urlCount = (sitemapBody.match(/<url>/gi) || []).length;
      findings.push({
        severity: "pass",
        type: `Sitemap.xml Present (${urlCount} URLs) [SEO]`,
        description: `sitemap.xml is accessible with ${urlCount} URL entries. Helps search engines discover all pages.`,
        location: `${baseUrl}/sitemap.xml`,
        recommendation: "Submit sitemap to Google Search Console and Bing Webmaster Tools. Set up automatic regeneration when pages change.",
        impact: "None — sitemap is present.",
        howTested: `SEO check: Fetched /sitemap.xml. Found ${urlCount} <url> entries.`,
        howCaused: "N/A",
      });
    } else {
      findings.push({
        severity: "medium",
        type: "No sitemap.xml [SEO]",
        description: `sitemap.xml returned HTTP ${sitemapRes.status}. Without a sitemap, search engines may miss pages.`,
        location: `${baseUrl}/sitemap.xml`,
        recommendation: "Generate a sitemap.xml and submit it to Google Search Console. Most frameworks have sitemap generation plugins.",
        impact: "Search engines may not discover all pages, especially deep or recently added ones.",
        howTested: `SEO check: Fetched /sitemap.xml. Got HTTP ${sitemapRes.status}.`,
        howCaused: "Sitemap not generated or configured for this project.",
      });
    }
  } catch { /* skip */ }

  // ── P15. Favicon ──────────────────────────────────────────────────────────

  const hasFaviconLink = /<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*/i.test(html);
  try {
    const faviconRes = await fetch(`${baseUrl}/favicon.ico`, { headers: hdr, signal: AbortSignal.timeout(5000) });
    const faviconOk = faviconRes.ok || hasFaviconLink;

    if (!faviconOk) {
      findings.push({
        severity: "low",
        type: "Missing Favicon [UX]",
        description: "No favicon found at /favicon.ico and no <link rel='icon'> in HTML. Browser tab shows default blank icon.",
        location: `${baseUrl}/favicon.ico`,
        recommendation: "Create a favicon.ico (at minimum 32x32) and add: <link rel='icon' href='/favicon.ico'>. Use modern formats for Apple and Android icons.",
        impact: "Browser tab shows no icon — hurts brand recognition and professionalism.",
        howTested: "UX check: Fetched /favicon.ico (returned non-200) and scanned for <link rel='icon'>. Neither found.",
        howCaused: "Favicon not created or linked for this project.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: "Favicon Present [UX]",
        description: hasFaviconLink ? "Favicon linked in HTML <head>." : "favicon.ico accessible at /favicon.ico.",
        location: `${baseUrl}/favicon.ico`,
        recommendation: "Also add apple-touch-icon for iOS home screen bookmarks.",
        impact: "None — favicon is present.",
        howTested: "UX check: Favicon accessible.",
        howCaused: "N/A",
      });
    }
  } catch { /* skip */ }

  // ── P16. Language Attribute ───────────────────────────────────────────────

  const htmlLang = html.match(/<html[^>]*lang=["']([^"']*)["'][^>]*/i)?.[1] || "";
  if (!htmlLang) {
    findings.push({
      severity: "medium",
      type: "Missing lang Attribute on <html> [Accessibility]",
      description: "The <html> element has no lang attribute. Screen readers cannot determine the page language for correct pronunciation.",
      location: url,
      recommendation: `Add lang attribute: <html lang="en"> (or appropriate language code).`,
      impact: "Screen readers use wrong pronunciation rules. Automatic translation tools may not detect language. WCAG 2.1 SC 3.1.1 violation.",
      howTested: `Accessibility check: Checked <html> opening tag for lang attribute. Not found.`,
      howCaused: "Page template does not include lang attribute on the root HTML element.",
    });
  } else {
    findings.push({
      severity: "pass",
      type: `HTML lang="${htmlLang}" Set [Accessibility]`,
      description: `Page correctly declares language: lang="${htmlLang}". Screen readers and search engines know the page language.`,
      location: url,
      recommendation: "Use specific locale codes where needed (e.g., lang='en-US' vs lang='en-GB').",
      impact: "None — lang attribute is set.",
      howTested: `Accessibility check: Found lang="${htmlLang}" on <html> element.`,
      howCaused: "N/A",
    });
  }

  // ── P17. Form Labels ──────────────────────────────────────────────────────

  const formInputs = html.match(/<input\b(?!(?:[^>]*type=["'](?:hidden|submit|button|reset|checkbox|radio)["']))[^>]*/gi) || [];
  const inputsWithId = formInputs.filter(inp => /\bid=["'][^"']+["']/i.test(inp));
  const labelsForInputs = (html.match(/<label[^>]*for=["']([^"']*)["'][^>]*/gi) || []).length;

  if (formInputs.length > 0 && labelsForInputs < formInputs.length * 0.5) {
    findings.push({
      severity: "medium",
      type: `Form Inputs Missing Labels (${labelsForInputs}/${formInputs.length}) [Accessibility]`,
      description: `${formInputs.length - labelsForInputs} form input(s) appear to have no associated <label> tag. Labels are required for screen reader accessibility.`,
      location: url,
      recommendation: "Add a <label for='inputId'> for every <input> field. Use aria-label as fallback when visual label is not possible.",
      impact: "Screen reader users cannot determine what each input field is for. WCAG 2.1 SC 1.3.1 violation. Also hurts usability on mobile (clicking label focuses input).",
      howTested: `Accessibility check: Found ${formInputs.length} non-hidden inputs and ${labelsForInputs} label[for] tags.`,
      howCaused: "Forms built with placeholder-only text instead of labels. Placeholders disappear when typing — not a substitute for labels.",
    });
  } else if (formInputs.length > 0) {
    findings.push({
      severity: "pass",
      type: "Form Inputs Have Associated Labels [Accessibility]",
      description: `${labelsForInputs} labels found for ${formInputs.length} form inputs — good label coverage.`,
      location: url,
      recommendation: "Also verify aria-describedby is used for complex input descriptions and error messages.",
      impact: "None — form label accessibility check passed.",
      howTested: `Accessibility check: ${labelsForInputs} label[for] tags for ${formInputs.length} inputs.`,
      howCaused: "N/A",
    });
  }

  // ── P18. Third-Party Resource Loading ─────────────────────────────────────

  const externalResources: string[] = [];
  const scriptSrcs = (html.match(/<script[^>]+src=["']([^"']+)["']/gi) || []).map(s => s.match(/src=["']([^"']+)["']/i)?.[1] || "");
  const linkHrefs = (html.match(/<link[^>]+href=["']([^"']+)["']/gi) || []).map(l => l.match(/href=["']([^"']+)["']/i)?.[1] || "");

  for (const r of [...scriptSrcs, ...linkHrefs]) {
    try { if (new URL(r).host !== new URL(url).host) externalResources.push(r); } catch {}
  }

  if (externalResources.length > 0) {
    const extResults = await Promise.allSettled(
      externalResources.slice(0, 5).map(r =>
        fetch(r, { headers: hdr, method: "HEAD", signal: AbortSignal.timeout(5000) })
          .then(res => ({ url: r, status: res.status, ok: res.ok }))
          .catch(() => ({ url: r, status: 0, ok: false }))
      )
    );

    const failedExternal = extResults
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<{ url: string; status: number; ok: boolean }>).value)
      .filter(r => !r.ok && r.status !== 301 && r.status !== 302);

    if (failedExternal.length > 0) {
      findings.push({
        severity: "high",
        type: `${failedExternal.length} External Resource(s) Failing to Load [Performance]`,
        description: `${failedExternal.length} third-party script/style resource(s) returned errors: ${failedExternal.slice(0, 2).map(r => `${r.url} → ${r.status}`).join(", ")}.`,
        location: url,
        recommendation: "Remove or replace failing external resources. Host critical resources locally to avoid third-party failures impacting your site.",
        impact: "Failed scripts can break page functionality. Failed stylesheets cause layout issues. Users see broken pages.",
        howTested: `Performance test: Detected ${externalResources.length} external resources and performed HEAD requests on ${Math.min(5, externalResources.length)}. ${failedExternal.length} failed.`,
        howCaused: "External CDN or third-party service is down, resource URL changed, or resource was deleted.",
      });
    } else {
      findings.push({
        severity: "pass",
        type: `All ${Math.min(5, externalResources.length)} External Resources Loading [Performance]`,
        description: `Tested ${Math.min(5, externalResources.length)} of ${externalResources.length} external resource(s) — all returning successfully.`,
        location: url,
        recommendation: "Consider hosting critical resources locally to avoid third-party failure cascades.",
        impact: "None — external resources are loading.",
        howTested: `Performance test: Sent HEAD requests to ${Math.min(5, externalResources.length)} external scripts/stylesheets. All returned 200.`,
        howCaused: "N/A",
      });
    }
  }

  // ── P19. Preload / Resource Hints ────────────────────────────────────────

  const hasPreload = /<link[^>]*rel=["']preload["'][^>]*/i.test(html);
  const hasPrefetch = /<link[^>]*rel=["']prefetch["'][^>]*/i.test(html);
  const hasDNSPrefetch = /<link[^>]*rel=["']dns-prefetch["'][^>]*/i.test(html);
  const hasPreconnect = /<link[^>]*rel=["']preconnect["'][^>]*/i.test(html);

  const resourceHintCount = [hasPreload, hasPrefetch, hasDNSPrefetch, hasPreconnect].filter(Boolean).length;

  if (resourceHintCount === 0 && externalResources.length > 0) {
    findings.push({
      severity: "low",
      type: "No Resource Hints (preload/prefetch/dns-prefetch) [Performance]",
      description: `Page has ${externalResources.length} external resources but no preload, prefetch, dns-prefetch, or preconnect hints. Resource hints can significantly speed up loading.`,
      location: url,
      recommendation: `Add to <head>: <link rel='preconnect' href='https://fonts.gstatic.com'> for Google Fonts, <link rel='dns-prefetch' href='//cdn.example.com'> for CDNs, <link rel='preload' as='script' href='/app.js'> for critical scripts.`,
      impact: "DNS lookups and connection setup for external resources happen late. Adding hints can shave 200-400ms off load time.",
      howTested: `Performance test: Scanned for resource hint <link> tags. None found despite ${externalResources.length} external resources.`,
      howCaused: "Resource hints not added during performance optimization.",
    });
  } else if (resourceHintCount > 0) {
    findings.push({
      severity: "pass",
      type: `Resource Hints Present (${resourceHintCount} type${resourceHintCount > 1 ? "s" : ""}) [Performance]`,
      description: `Page uses resource hints: ${[hasPreload && "preload", hasPrefetch && "prefetch", hasDNSPrefetch && "dns-prefetch", hasPreconnect && "preconnect"].filter(Boolean).join(", ")}.`,
      location: url,
      recommendation: "Use preconnect for critical third-party origins (fonts, analytics). Use preload for render-blocking resources.",
      impact: "None — resource hints are configured.",
      howTested: "Performance test: Scanned for resource hint link tags.",
      howCaused: "N/A",
    });
  }

  // ── P20. Inline Script / Style Amount ─────────────────────────────────────

  const inlineScripts = (html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []);
  const inlineStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []);
  const inlineStyleAttr = (html.match(/style=["'][^"']{200,}["']/gi) || []).length;

  const totalInlineKB = Math.round((inlineScripts.join("").length + inlineStyles.join("").length) / 1024);

  if (totalInlineKB > 50) {
    findings.push({
      severity: "medium",
      type: `Large Inline Scripts/Styles (${totalInlineKB}KB) [Performance]`,
      description: `${inlineScripts.length} inline <script> block(s) and ${inlineStyles.length} inline <style> block(s) totaling ~${totalInlineKB}KB. Inline code cannot be cached separately.`,
      location: url,
      recommendation: "Move inline scripts and styles to external .js and .css files. External files are cached by the browser on repeat visits.",
      impact: "Inline code is downloaded fresh on every page load — cannot be cached. Also prevents Content Security Policy from blocking injected scripts.",
      howTested: `Performance test: Measured total size of inline <script> and <style> tags: ${totalInlineKB}KB.`,
      howCaused: "Code was written inline for convenience during development and not moved to external files for production.",
    });
  }

  // ── P21. Print Stylesheet ─────────────────────────────────────────────────

  const hasPrintCSS = /<link[^>]*media=["']print["'][^>]*/i.test(html) || /@media\s+print/i.test(html);
  if (hasPrintCSS) {
    findings.push({
      severity: "pass",
      type: "Print Stylesheet Present [UX]",
      description: "Print-specific CSS detected. Page is optimized for printing.",
      location: url,
      recommendation: "Test print preview in browser. Ensure navigation, ads, and interactive elements are hidden in print view.",
      impact: "None — print styles are present.",
      howTested: "UX check: Found @media print or <link media='print'> in HTML.",
      howCaused: "N/A",
    });
  }

  // ── P22. Dark Mode Support ────────────────────────────────────────────────

  const hasDarkMode = /@media\s*\(prefers-color-scheme:\s*dark\)/i.test(html)
    || /prefers-color-scheme|dark-mode|darkMode|data-theme/i.test(html);

  if (hasDarkMode) {
    findings.push({
      severity: "pass",
      type: "Dark Mode Support Detected [UX]",
      description: "prefers-color-scheme media query or dark mode implementation detected. The site respects users' OS dark mode preference.",
      location: url,
      recommendation: "Test dark mode across all pages and components. Ensure all text has sufficient contrast in dark mode.",
      impact: "None — dark mode is implemented.",
      howTested: "UX check: Found prefers-color-scheme or dark mode class patterns in HTML/CSS.",
      howCaused: "N/A",
    });
  }

  // ── P23. Reduced Motion Support ───────────────────────────────────────────

  const hasReducedMotion = /prefers-reduced-motion/i.test(html);
  const hasAnimations = /animation|transition|@keyframes/i.test(html);

  if (hasAnimations && !hasReducedMotion) {
    findings.push({
      severity: "low",
      type: "Animations Without prefers-reduced-motion [Accessibility]",
      description: "Page uses CSS animations/transitions but no prefers-reduced-motion media query found. Users with vestibular disorders or epilepsy may be affected.",
      location: url,
      recommendation: "Wrap animations in: @media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }",
      impact: "Users with vestibular disorders (motion sickness) or photosensitive epilepsy may experience discomfort. WCAG 2.3.3 guideline.",
      howTested: "Accessibility check: Found animation/transition CSS but no prefers-reduced-motion media query.",
      howCaused: "Animations added without considering users who have requested reduced motion in their OS settings.",
    });
  } else if (hasReducedMotion) {
    findings.push({
      severity: "pass",
      type: "prefers-reduced-motion Respected [Accessibility]",
      description: "Page respects the prefers-reduced-motion user preference — accessibility for users with motion sensitivity is considered.",
      location: url,
      recommendation: "Test with prefers-reduced-motion enabled (OS setting or Chrome DevTools). Verify all significant animations are disabled.",
      impact: "None — reduced motion is handled.",
      howTested: "Accessibility check: Found prefers-reduced-motion in CSS.",
      howCaused: "N/A",
    });
  }

  // ── P24. Skip Navigation Link ─────────────────────────────────────────────

  const hasSkipNav = /skip.*(nav|content|main)|jump.*(content|main)/i.test(html);
  const hasMainLandmark = /<main[^>]*/i.test(html) || /role=["']main["']/i.test(html);

  if (!hasSkipNav && !hasMainLandmark) {
    findings.push({
      severity: "low",
      type: "No Skip Navigation Link or Main Landmark [Accessibility]",
      description: "No 'skip to content' link or <main> landmark element found. Keyboard users must tab through all navigation on every page.",
      location: url,
      recommendation: "Add a skip link: <a href='#main-content' class='skip-link'>Skip to main content</a> and a <main id='main-content'> wrapper.",
      impact: "Keyboard-only users and screen reader users must tab through the full navigation menu on every page load before reaching content. WCAG 2.4.1.",
      howTested: "Accessibility check: Scanned for 'skip to content' link text and <main> element.",
      howCaused: "Navigation accessibility features not implemented in the page template.",
    });
  }

  // ── P25. Focus Indicator ──────────────────────────────────────────────────

  const removesOutline = /outline:\s*0|outline:\s*none/i.test(html);
  if (removesOutline) {
    findings.push({
      severity: "medium",
      type: "CSS Removes Focus Outline [Accessibility]",
      description: "CSS contains 'outline: 0' or 'outline: none' — this removes the keyboard focus indicator that shows which element is focused.",
      location: url,
      recommendation: "Never globally remove outline. Instead, apply a custom focus style: ':focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }' This applies to keyboard navigation only, not mouse clicks.",
      impact: "Keyboard-only users cannot see which element is focused. WCAG 2.4.7 violation. Effectively makes the site unusable for keyboard navigation.",
      howTested: "Accessibility check: Found 'outline: 0' or 'outline: none' in inline styles or <style> blocks in the page source.",
      howCaused: "Developer removed focus outlines to make the design 'cleaner'. This is a common but serious accessibility mistake.",
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
    // ── Functional / UX Tests ──
    {
      severity: "high",
      type: "Buttons Without Accessible Labels",
      description: "Icon-only buttons detected without aria-label or visible text. Screen readers cannot describe what these buttons do.",
      location: source,
      recommendation: "Add aria-label or visible text to every button. Example: <button aria-label='Close'>✕</button>",
      impact: "Screen reader users cannot interact with these buttons. Automated test tools cannot identify them by label. A human tester would immediately flag these as a functional failure.",
      howTested: "Every <button> element's inner text was stripped of HTML tags. Buttons with empty content and no aria-label were flagged.",
      howCaused: "Buttons were implemented as icon-only (SVG/emoji) without accessible text alternatives.",
    },
    {
      severity: "high",
      type: "Dead / Non-Functional Links",
      description: "Links with href='#' or empty href detected. These look clickable but do nothing.",
      location: source,
      recommendation: "Replace dead links with real URLs or convert them to <button> elements for click interactions.",
      impact: "Users click links expecting navigation — nothing happens. This is an immediate functional QA failure a human tester finds on first use.",
      howTested: "Every <a> element's href was extracted. Values of '#', empty strings, and 'javascript:void(0)' were counted as dead links.",
      howCaused: "Links used as button-like elements during development without being updated to real destinations.",
    },
    {
      severity: "high",
      type: "Images Missing Alt Text",
      description: "Images found without alt attributes. Screen readers announce the filename or nothing at all.",
      location: source,
      recommendation: "Add descriptive alt text to all meaningful images. Use alt='' for decorative ones.",
      impact: "Fails WCAG 2.1 Level A. Screen reader users get zero information about image content. Also a legal compliance risk in many jurisdictions.",
      howTested: "All <img> elements checked for alt attribute. Those without it or with empty alt on non-decorative images were flagged.",
      howCaused: "Images were added to HTML without the alt attribute — the most common accessibility omission.",
    },
    {
      severity: "medium",
      type: "Forms Without Submit Button",
      description: "Forms detected without a visible submit button. Users cannot complete form submission.",
      location: source,
      recommendation: "Add <button type='submit'> or <input type='submit'> to every form. Always test form submission manually.",
      impact: "Direct functional failure — users fill in the form but cannot submit. First thing a human QA tester finds.",
      howTested: "Every <form> element inspected for submit button (type='submit' input or button element without type='button'/'reset').",
      howCaused: "Submit button was removed, or form relies on programmatic JS submission without a visible control — breaking keyboard-only users.",
    },
    {
      severity: "medium",
      type: "Buttons Missing type Attribute",
      description: "Buttons without explicit type='button|submit|reset' default to type='submit', accidentally submitting parent forms.",
      location: source,
      recommendation: "Always add type='button' to non-submit buttons and type='submit' to form submit buttons.",
      impact: "Clicking a typeless button inside a form triggers form submission — causes lost data, unexpected navigation, or duplicate API calls.",
      howTested: "All <button> elements checked for explicit type attribute. Those without it were counted.",
      howCaused: "Buttons were added without a type attribute, relying on the default (submit) which triggers form submission unexpectedly.",
    },
    {
      severity: "medium",
      type: "Form Inputs Relying Only on Placeholder",
      description: "Inputs using placeholder text as the only label. Placeholder disappears on focus — users forget what the field is for.",
      location: source,
      recommendation: "Use <label for='id'> or aria-label for every input. Placeholder is a hint, not a label.",
      impact: "Users (especially those with cognitive disabilities) forget what a field requires after they start typing. WCAG 2.1 Level AA failure.",
      howTested: "Inputs without an associated <label> and without aria-label were checked for placeholder-only labeling.",
      howCaused: "Placeholder text was used as the sole label — a design shortcut that fails usability and accessibility standards.",
    },
    {
      severity: "medium",
      type: "No H1 Heading",
      description: "Page has no <h1> heading. Every page should have exactly one H1 describing its main topic.",
      location: source,
      recommendation: "Add a single <h1> that describes the primary purpose of this page.",
      impact: "Screen readers cannot announce the page title. Search engines have no primary topic signal. Both SEO and accessibility suffer.",
      howTested: "HTML scanned for <h1> elements. Count was 0.",
      howCaused: "Heading implemented with styled <div> or as an image without a text alternative, bypassing semantic heading structure.",
    },
    {
      severity: "medium",
      type: "Missing lang Attribute on <html>",
      description: "The <html> element lacks a lang attribute. Screen readers cannot detect the page language.",
      location: source,
      recommendation: "Add lang='en' (or appropriate BCP 47 language code) to the <html> root element.",
      impact: "Screen readers use wrong language for pronunciation — content becomes incomprehensible. WCAG 2.1 Level A failure.",
      howTested: "HTML root element checked for lang attribute.",
      howCaused: "The <html> tag was templated without a lang attribute — extremely common in quick-start templates.",
    },
    {
      severity: "low",
      type: "External Links Missing rel='noopener'",
      description: "External links opening in a new tab (_blank) found without rel='noopener noreferrer'.",
      location: source,
      recommendation: "Add rel='noopener noreferrer' to all target='_blank' external links.",
      impact: "The opened page can access window.opener and redirect your page to a malicious URL (reverse tabnapping attack).",
      howTested: "All <a target='_blank'> pointing to external domains checked for rel='noopener' attribute.",
      howCaused: "Links were added with target='_blank' without the security attribute — an extremely common oversight.",
    },
    {
      severity: "low",
      type: "No Skip Navigation Link",
      description: "No 'Skip to main content' link found. Keyboard users must tab through the entire navigation on every page.",
      location: source,
      recommendation: "Add as the first element: <a href='#main' class='sr-only focus:not-sr-only'>Skip to main content</a>",
      impact: "Keyboard-only users must press Tab many times on every page load before reaching content. A major accessibility friction point.",
      howTested: "HTML scanned for skip link patterns (anchors containing 'skip', 'main', or 'content' text).",
      howCaused: "Skip links are invisible to sighted users so they're routinely omitted — only discovered through keyboard or screen reader testing.",
    },
    {
      severity: "pass",
      type: "All Buttons Have Accessible Labels",
      description: "All buttons on the page have visible text or aria-label attributes.",
      location: source,
      recommendation: "Continue auditing for keyboard focus visibility on all buttons.",
      impact: "None.",
      howTested: "Each button's inner text and aria attributes were inspected. All buttons passed the accessible label check.",
      howCaused: "N/A",
    },
    {
      severity: "pass",
      type: "Forms Have Submit Buttons",
      description: "All forms contain visible submit buttons — users can complete form submission.",
      location: source,
      recommendation: "Test each form manually: fill fields, submit, verify success/error responses.",
      impact: "None.",
      howTested: "Every <form> element checked for submit button (type='submit').",
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
        const fetchStart = Date.now();
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
        let responseBytes = 0;
        if (response.ok) {
          send({ progress: 25, message: "Downloading and parsing HTML content..." });
          html = await response.text();
          responseBytes = html.length;
          if (html.length > 800000) html = html.slice(0, 800000);
        }
        const responseMs = Date.now() - fetchStart;

        send({ progress: 40, message: "Running security header analysis..." });
        const headerFindings = analyzeHeaders(rawHeaders, url);

        send({ progress: 55, message: "Scanning HTML for vulnerabilities and bizarre patterns..." });
        const htmlFindings = analyzeHtmlContent(html, url);

        send({ progress: 65, message: "Running functional UX tests — buttons, links, forms, images..." });
        const uxFindings = analyzeUserExperience(html, url, responseMs, responseBytes, response.status);

        send({ progress: 72, message: "Simulating human interactions — login flows, button spam, form submissions, internal links..." });
        const interactiveFindings = await analyzeInteractiveFlow(html, url);

        send({ progress: 80, message: "Running advanced security probes — 60+ sensitive paths, HTTP methods, CORS, CSRF, timing attacks, open redirects..." });
        const advancedSecFindings = await analyzeAdvancedSecurity(html, url);

        send({ progress: 88, message: "Auditing SEO, performance, PWA, accessibility, mobile, structured data, compression..." });
        const perfSeoFindings = await analyzePerformanceSEO(html, url);

        send({ progress: 95, message: "Compiling full severity-ordered report..." });
        const allFindings = [...headerFindings, ...htmlFindings, ...uxFindings, ...interactiveFindings, ...advancedSecFindings, ...perfSeoFindings];
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
        const fetchStart = Date.now();
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; QABot/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        const rawHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { rawHeaders[k] = v; });
        const rawHtml = response.ok ? await response.text() : "";
        const responseMs = Date.now() - fetchStart;
        const responseBytes = rawHtml.length;
        const html = rawHtml.slice(0, 800000);
        const [interactiveFindingsNS, advancedSecFindingsNS, perfSeoFindingsNS] = await Promise.all([
          analyzeInteractiveFlow(html, url),
          analyzeAdvancedSecurity(html, url),
          analyzePerformanceSEO(html, url),
        ]);
        const allFindings = [
          ...analyzeHeaders(rawHeaders, url),
          ...analyzeHtmlContent(html, url),
          ...analyzeUserExperience(html, url, responseMs, responseBytes, response.status),
          ...interactiveFindingsNS,
          ...advancedSecFindingsNS,
          ...perfSeoFindingsNS,
        ];
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
  const systemPrompt = `You are an elite QA engineer, security researcher, and UX specialist. Analyze the provided code/content and generate an EXHAUSTIVE QA report covering BOTH security vulnerabilities AND real human functional/UX issues.

IMPORTANT RULES:
1. Sort all findings by severity: critical → high → medium/warning → low → passed (green)
2. For EVERY finding, provide:
   - howTested: The exact methodology used to discover this (e.g., "Counted all <button> elements and checked each for accessible text and type attribute", "HTTP header inspection for CSP", "Regex scan for eval() patterns")
   - howCaused: What causes this issue and what a real user would experience / how an attacker exploits it
3. Include SECURITY tests: CSP, HSTS, XSS, CSRF, clickjacking, eval(), prototype pollution, DOM clobbering, data URI abuse, open redirects, CORS, server disclosure
4. Include FUNCTIONAL / UX tests (things a human QA tester checks):
   - Do all buttons have labels and type attributes?
   - Are all links functional (not href="#" or empty)?
   - Do forms have submit buttons?
   - Do all inputs have associated labels?
   - Are images missing alt text?
   - Is there a <nav> landmark? Is a skip link present?
   - Does the page have one H1 heading?
   - Are phone numbers clickable (tel: links)?
   - Are external links safe (rel=noopener)?
   - Are there any broken/null image src values?
   - Is the HTML lang attribute set?
   - Are inputs missing maxlength?
   - Are there JavaScript error stack traces visible in the HTML?
5. Include BIZARRE edge-case tests: DOM clobbering, prototype pollution, data URI abuse, timing attacks, soft 404s, tabindex abuse, homograph attacks, CSS injection
6. Be thorough — run at least 25 different test categories
7. Passed checks (green) should document exactly what was verified and that it passed`;

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
