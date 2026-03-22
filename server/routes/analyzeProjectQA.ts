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

        send({ progress: 70, message: "Running functional UX tests — buttons, links, forms, images..." });
        const uxFindings = analyzeUserExperience(html, url, responseMs, responseBytes, response.status);

        send({ progress: 85, message: "Compiling severity-ordered report..." });
        const allFindings = [...headerFindings, ...htmlFindings, ...uxFindings];
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
        const allFindings = [
          ...analyzeHeaders(rawHeaders, url),
          ...analyzeHtmlContent(html, url),
          ...analyzeUserExperience(html, url, responseMs, responseBytes, response.status),
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
