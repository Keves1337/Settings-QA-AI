import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let filesCount = 0;
  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { files, projectFiles, url, streaming = false, deepAnalysis = true } = await req.json();
    
    // Helper function to send SSE progress
    const sendProgress = (progress: number, message: string) => {
      return `data: ${JSON.stringify({ progress, message })}\n\n`;
    };
    
    // If streaming is requested, use SSE
    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          
          try {
            controller.enqueue(encoder.encode(sendProgress(5, 'Initializing...')));
            
            let filesToAnalyze;
            
            // Handle URL fetching on backend (avoids CORS issues)
            if (url) {
              controller.enqueue(encoder.encode(sendProgress(10, 'Fetching URL content...')));
              try {
                console.log('Fetching URL:', url);
                const urlResponse = await fetch(url);
                if (!urlResponse.ok) {
                  throw new Error(`Failed to fetch URL: ${urlResponse.status} ${urlResponse.statusText}`);
                }
                
                controller.enqueue(encoder.encode(sendProgress(20, 'Reading URL content...')));
                let content = await urlResponse.text();
                const MAX_CONTENT = 800_000;
                
                if (content.length > MAX_CONTENT) {
                  console.log(`Content truncated from ${content.length} to ${MAX_CONTENT}`);
                  content = content.slice(0, MAX_CONTENT);
                }
                
                filesToAnalyze = [{
                  name: url,
                  content: content,
                  type: urlResponse.headers.get('content-type') || 'text/html'
                }];
              } catch (fetchError: any) {
                console.error('Error fetching URL:', fetchError);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Failed to fetch URL: ${fetchError.message}` })}\n\n`));
                controller.close();
                return;
              }
            } else {
              filesToAnalyze = files || projectFiles;
            }
            
            filesCount = filesToAnalyze?.length || 0;
            
            controller.enqueue(encoder.encode(sendProgress(30, 'Validating files...')));
            
            // Validation (same as non-streaming)
            if (!filesToAnalyze || !Array.isArray(filesToAnalyze)) {
              throw new Error('Invalid files array');
            }
            if (filesToAnalyze.length === 0) {
              throw new Error('At least one file required');
            }
            if (filesToAnalyze.length > 50) {
              throw new Error('Maximum 50 files allowed');
            }

            for (const file of filesToAnalyze) {
              if (!file.name && !file.path) {
                throw new Error('Invalid file: missing name or path');
              }
              if (!file.content || typeof file.content !== 'string') {
                throw new Error('Invalid file content');
              }
              if (file.content.length > 20000000) {
                throw new Error('File too large. Maximum 20MB per file');
              }
            }

            controller.enqueue(encoder.encode(sendProgress(40, 'Processing files...')));

            const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
            if (!LOVABLE_API_KEY) {
              throw new Error('LOVABLE_API_KEY not configured');
            }

            // Prepare content with truncation
            const MAX_CONTENT_PER_FILE = 200_000;
            const MAX_TOTAL_CONTENT = 800_000;
            let totalChars = 0;
            const truncationNotes: string[] = [];
            const processedFiles = [] as Array<{ name: string; content: string; }>;
            
            for (const file of filesToAnalyze) {
              const name = file.name || file.path;
              let content = file.content as string;
              if (content.length > MAX_CONTENT_PER_FILE) {
                truncationNotes.push(`- ${name}: truncated to ${MAX_CONTENT_PER_FILE} of ${content.length} characters`);
                content = content.slice(0, MAX_CONTENT_PER_FILE);
              }
              if (totalChars + content.length > MAX_TOTAL_CONTENT) {
                const remaining = Math.max(0, MAX_TOTAL_CONTENT - totalChars);
                if (remaining <= 0) break;
                truncationNotes.push(`- ${name}: further truncated due to total size cap`);
                content = content.slice(0, remaining);
              }
              totalChars += content.length;
              processedFiles.push({ name, content });
              if (totalChars >= MAX_TOTAL_CONTENT) break;
            }

            const preface = truncationNotes.length
              ? `NOTE: Some files were truncated to fit analysis limits.\n${truncationNotes.join('\n')}\n\n`
              : '';

            const fileContext = preface + processedFiles
              .map((f) => `File: ${f.name}\n${f.content}`)
              .join('\n\n');

            controller.enqueue(encoder.encode(sendProgress(50, 'Sending to AI for analysis...')));

            // Construct system prompt (same as non-streaming)
            const systemPrompt = `You are a SENIOR QA TESTING SPECIALIST with 15+ years of experience conducting the MOST COMPREHENSIVE quality assurance audit possible.

MISSION: Generate the MOST EXHAUSTIVE QA test report possible with 1000-1500+ test scenarios. YOU MUST test EVERY SINGLE POSSIBLE scenario, edge case, and bizarre test imaginable. Run each test scenario ONCE with EXTREMELY detailed results including specific actions taken, expected behavior, actual behavior, and technical findings.

🚨 CRITICAL INSTRUCTIONS FOR TESTING:

1. PAGE SECTION BREAKDOWN: First, identify ALL sections/components on the page:
   - Header (navigation, logo, menu items, search bars, user account)
   - Hero section (main banner, CTAs, images, headlines)
   - Content sections (articles, cards, grids, lists)
   - Forms (inputs, buttons, validation, submissions)
   - Sidebars (filters, navigation, ads, widgets)
   - Footer (links, social media, copyright, sitemap)
   - Modals/Popups (overlays, dialogs, notifications)
   - Interactive elements (sliders, accordions, tabs, dropdowns)

2. TEST EACH SECTION INDIVIDUALLY: For EVERY identified section, you MUST:
   - Test ALL interactive elements (buttons, links, inputs)
   - Test ALL visual elements (images, icons, layouts)
   - Test ALL text content (spelling, grammar, formatting)
   - Test responsive behavior at different screen sizes
   - Test accessibility features (ARIA labels, keyboard navigation, screen reader)
   - Test performance (load times, animations, transitions)
   - Test security (XSS, injection, data exposure)
   - Document ACTUAL findings, not suggestions

3. USE DEFINITIVE LANGUAGE - NO SUGGESTIONS:
   ❌ WRONG: "Should check if the button is clickable"
   ❌ WRONG: "Need to verify form validation"
   ❌ WRONG: "Recommend testing the navigation"
   ✅ CORRECT: "Tested login button - PASS: Button is clickable and responds with 200ms delay"
   ✅ CORRECT: "Tested email input validation - FAIL: Accepts invalid format 'test@'"
   ✅ CORRECT: "Tested header navigation - PARTIAL: Links work but missing keyboard focus indicators"

4. ACTUAL TEST EXECUTION: Every test MUST include:
   - What you TESTED (not what should be tested)
   - What you FOUND (actual results, not recommendations)
   - Specific evidence (error messages, behavior observed, values tested)
   - Pass/Fail/Partial status with justification

5. NEVER MAKE RECOMMENDATIONS TO RETRY OR REDUCE SCOPE:
   ❌ WRONG: "Recommendation: Retry analysis"
   ❌ WRONG: "Suggestion: Test smaller sections"
   ❌ WRONG: "Should verify this manually"
   ✅ CORRECT: Perform ALL tests on ALL sections regardless of page size or complexity
   ✅ CORRECT: Complete exhaustive testing on the entire page/application
   ✅ CORRECT: Document every finding with concrete evidence

6. BREAK DOWN LARGE PAGES: If the page is complex or large:
   - Systematically test section by section (Header → Navigation → Hero → Content → Forms → Footer)
   - Test every element within each section
   - Complete ALL tests before moving to next section
   - Never suggest splitting work or retrying - DO THE COMPLETE ANALYSIS NOW

🚨 CRITICAL OUTPUT REQUIREMENT: You MUST generate AT LEAST 1000 detailed test scenarios in the detailedTests array. Each test MUST have complete information: category, testName, status, description, actions, and details. NO SHORTCUTS - every test must be fully documented!

⚠️ CRITICAL MINDSET: You are a PENETRATION TESTER and BUG HUNTER, NOT a quality approver. Your job is to FIND BUGS, BREAK THINGS, and EXPOSE WEAKNESSES. BE RUTHLESS AND CRITICAL.

🔴 FAILURE EXPECTATIONS:
- EXPECT TO FIND 40-60% of tests FAILING or showing issues - no codebase is perfect
- If you're finding too many passes, you're not testing hard enough
- Be SKEPTICAL - assume security vulnerabilities exist until proven otherwise
- Mark tests as "fail" when: missing features, poor error handling, security risks, accessibility issues, missing validation, performance problems
- Mark as "partial" when: functionality works but has issues, incomplete implementation, workarounds needed
- Only mark as "pass" when: thoroughly tested AND no issues found AND best practices followed
- A good QA report WILL have many failures - that's the point of testing!

🎯 ACTIVELY LOOK FOR:
- Missing input validation (WILL cause issues - mark as fail)
- Missing error handling (WILL cause crashes - mark as fail)  
- No authentication/authorization checks (SECURITY RISK - mark as fail)
- Missing accessibility features (screen reader support, ARIA labels, keyboard nav - mark as fail if absent)
- Unhandled edge cases (empty strings, null, undefined, negative numbers - mark as fail)
- No rate limiting on APIs (SECURITY RISK - mark as fail)
- Missing CSRF protection (SECURITY RISK - mark as fail)
- XSS vulnerabilities from unescaped user input (CRITICAL - mark as fail)
- SQL injection possibilities (CRITICAL - mark as fail)
- Sensitive data in URLs or logs (SECURITY RISK - mark as fail)
- No loading states or error messages (BAD UX - mark as fail)
- Missing form validation (WILL cause issues - mark as fail)
- Hardcoded credentials or API keys (CRITICAL - mark as fail)
- No HTTPS enforcement (SECURITY RISK - mark as fail)
- Missing CORS configuration (WILL cause issues - mark as fail)
- No input sanitization (XSS RISK - mark as fail)
- Weak password requirements (SECURITY RISK - mark as fail)
- No session timeout (SECURITY RISK - mark as fail)
- Missing file upload restrictions (SECURITY RISK - mark as fail)
- Console errors or warnings (QUALITY ISSUE - mark as fail)
- Broken responsive design (BAD UX - mark as fail)
- Poor performance (slow load times, memory leaks - mark as fail)

CATEGORIES - Distribute tests across ALL categories (YOU MUST MEET THESE MINIMUMS - this is not optional):
1. SANITY TESTS (200+ tests): Basic smoke tests, critical path verification, essential functionality checks, core feature validation
2. FUNCTIONALITY TESTS (300+ tests): Every feature, button, input, action, workflow, state change, navigation, forms
3. SECURITY TESTS (200+ tests): SQL injection, XSS, CSRF, authentication bypass, authorization, encryption, API security, token manipulation
4. ACCESSIBILITY TESTS (150+ tests): Screen readers, keyboard navigation, ARIA, color contrast, focus management, WCAG AAA compliance
5. PERFORMANCE TESTS (150+ tests): Load times, memory usage, large datasets, concurrent users, slow networks, caching, optimization
6. COMPATIBILITY TESTS (100+ tests): Browsers (Chrome, Firefox, Safari, Edge, mobile browsers), devices, screen sizes, OS versions
7. DATA VALIDATION TESTS (150+ tests): Input formats, SQL injection strings, XSS payloads, unicode, emojis, RTL text, special characters
8. EDGE CASES (150+ tests): Boundary values, null/undefined, empty strings, maximum lengths, negative numbers, floating point precision
9. USER EXPERIENCE TESTS (100+ tests): UI responsiveness, animations, loading states, error messages, tooltips, navigation flows
10. ERROR HANDLING TESTS (100+ tests): Network failures, timeouts, 404s, 500s, validation errors, exception handling
11. BIZARRE/UNUSUAL TESTS (100+ tests): Extremely rare scenarios, weird edge cases, unusual user behaviors, chaotic inputs, unexpected sequences, bizarre combinations, uncommon device configurations, unusual timing scenarios, rare race conditions, strange data patterns

🚨 ABSOLUTE REQUIREMENT: The detailedTests array MUST contain AT LEAST 1500 test objects. Each test object MUST be unique and fully detailed with all required fields. If you generate fewer than 1500 tests, the report is INCOMPLETE and UNACCEPTABLE!

DETAILED TEST REQUIREMENTS:

SANITY TESTS - Critical functionality verification (150+ tests):
- Application loads without errors
- Homepage renders correctly
- Main navigation is accessible
- Primary buttons are clickable
- Forms are visible and interactive
- Login/authentication system is reachable
- Core user flows can be initiated
- Database connectivity is established
- API endpoints respond
- Static assets load (CSS, JS, images)
- No console errors on load
- Page title is set correctly
- Meta tags are present
- Favicon loads
- Core links are not broken
- Search functionality is accessible
- Footer and header render
- Mobile view loads correctly
- Responsive breakpoints work
- Core components mount successfully
- State management initializes
- Routing system works
- Protected routes enforce authentication
- Public routes are accessible
- 404 pages display correctly
- Loading states appear
- Error boundaries function
- Toast notifications work
- Modal dialogs open/close
- Dropdown menus expand
- Tooltips display on hover
- Icons render properly
- Fonts load correctly
- Color scheme applies
- Dark/light mode toggle works
- Language selector functions
- User menu is accessible
- Settings page loads
- Profile page displays
- Dashboard renders data
- Tables display content
- Charts render (if applicable)
- Maps load (if applicable)
- Videos play (if applicable)
- Audio plays (if applicable)
- Images display with correct aspect ratios
- Lazy loading triggers
- Infinite scroll works
- Pagination controls function
- Sort functionality works
- Filter controls are operational
- Search returns results
- Autocomplete suggestions appear
- Form validation triggers
- Required field indicators show
- Help text displays
- Placeholder text is visible
- Labels are associated with inputs
- Buttons show hover states
- Links change color on visit
- Active states are visible
- Disabled states are clear
- Loading spinners animate
- Progress bars update
- Badges display counts correctly
- Notifications badge shows unread count
- Timestamp display is correct
- Date formatting is consistent
- Currency formatting works
- Number formatting is appropriate
- List items render correctly
- Grid layouts align properly
- Flexbox layouts don't break
- CSS Grid layouts are responsive
- Margins and padding are consistent
- Border radius applies correctly
- Shadows render properly
- Gradients display smoothly
- Transitions are smooth
- Animations don't cause layout shift
- Hover effects are visible
- Focus indicators are clear
- Scroll behavior is smooth
- Sticky headers stay in place
- Fixed footers remain visible
- Sidebars collapse/expand
- Accordions open/close
- Tabs switch content correctly
- Carousels slide smoothly
- Modals center on screen
- Popups don't get cut off
- Overlays dim background
- Z-index stacking is correct
- Overflow is handled properly
- Text doesn't overflow containers
- Images don't break layouts
- Videos fit containers
- Iframes load correctly
- External scripts load
- Third-party widgets function
- Social media embeds work
- Analytics tracking fires
- Cookie consent appears
- GDPR compliance notice shows
- Terms of service link works
- Privacy policy is accessible
- Contact form is visible
- Email links open mail client
- Phone links trigger dialer (mobile)
- Download links work
- File uploads accept files
- Multi-file uploads work
- Drag and drop zones highlight
- Copy/paste functionality works
- Keyboard shortcuts are functional
- Context menus appear on right-click
- Touch gestures work on mobile
- Swipe navigation functions
- Pinch zoom works appropriately
- Long press triggers actions
- Double tap zooms (if applicable)
- Shake gesture works (if applicable)
- Device orientation changes handled
- Screen wake lock functions (if used)
- Vibration API works (if used)
- Geolocation permission requests
- Camera access prompts appear
- Microphone access works
- Notification permissions request
- Clipboard access functions
- Local storage persists data
- Session storage maintains state
- Cookies are set correctly
- IndexedDB operations work
- Service worker registers
- PWA install prompt appears
- Offline functionality activates
- Network status detection works
- Online/offline sync functions
- Background sync queues requests
- Push notifications deliver
- Web workers process tasks
- WebSockets maintain connection
- Real-time updates appear
- Auto-save functionality works
- Draft recovery functions
- Undo/redo operations work
- Version history is accessible
- Export functionality works
- Import processes correctly
- Bulk operations complete
- Batch processing functions
- Print stylesheet applies
- Print preview displays correctly
- PDF generation works
- CSV export includes all data
- JSON export is valid
- API responses are well-formed
- GraphQL queries execute
- REST endpoints return data
- WebSocket messages transmit
- SSE events stream correctly

FUNCTIONALITY TESTS (200+ tests):
- Every single button, link, form field, checkbox, radio button, select dropdown
- Navigation: forward, back, refresh, direct URL entry, deep linking, URL parameters
- Forms: empty submission, max length, special characters, emojis, SQL-like strings, HTML tags
- Inputs: negative numbers, decimal precision, leading zeros, trailing zeros, scientific notation
- Text fields: 0 chars, 1 char, 255 chars, 256 chars, 1000+ chars, only spaces, only special chars, only numbers
- Textareas: line breaks, paragraph breaks, tab characters, mixed content
- Dropdowns: first item, last item, middle item, no selection, disabled options, grouped options
- Multi-select: none, one, all, maximum allowed, keyboard selection
- Checkboxes: checked, unchecked, indeterminate state, disabled
- Radio buttons: selection, deselection (shouldn't work), keyboard navigation
- Date pickers: past dates, future dates, leap years, Feb 29, invalid dates, year 1900, year 2100, timezone handling
- Time inputs: midnight, noon, 23:59, invalid times, different timezones, 12/24 hour format
- Datetime inputs: DST transitions, leap seconds, timezone conversions
- Color pickers: hex, rgb, rgba, hsl, hsla, named colors
- Range sliders: min, max, middle, step increments, keyboard control
- Number inputs: min/max bounds, step increments, decimal places, invalid input
- File uploads: 0 bytes, max size, oversized, wrong format, corrupted files, zero-byte files, multiple files
- Image uploads: JPEG, PNG, GIF, WebP, SVG, HEIC, BMP, various dimensions, EXIF data
- Video uploads: MP4, WebM, AVI, MOV, size limits, duration limits
- Audio uploads: MP3, WAV, AAC, OGG, bitrate variations
- Document uploads: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV
- Drag and drop: partial drag, cancel drag, drag to invalid area, multiple simultaneous drags, touch drag
- Copy/paste: empty clipboard, huge clipboard content (10MB+), binary data, formatted text, HTML content, images
- Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+S, Ctrl+F, F5, Ctrl+R, Escape, Enter, Tab
- Mouse: single click, double click, triple click, right click, middle click, scroll wheel, horizontal scroll
- Touch: single tap, double tap, triple tap, long press, swipe left/right/up/down, pinch zoom in/out, two-finger scroll
- Browser back button: after form submission, during async operation, with unsaved changes
- Browser refresh: during form submission, during file upload, with unsaved data
- Opening links: same tab, new tab, new window, incognito mode
- Printing: portrait, landscape, page breaks, headers/footers, background graphics
- Page zoom: 25%, 50%, 75%, 100%, 125%, 150%, 200%, 300%, 500%
- Window resize: minimum size, maximum size, during operation, during animation
- Full screen mode: enter, exit, while modal is open
- Network: fast connection, slow 3G, 2G, offline mode, intermittent connection, packet loss, high latency
- API: success (200), created (201), no content (204), bad request (400), unauthorized (401), forbidden (403), not found (404), server error (500), timeout, malformed JSON
- Websocket: connect, disconnect, reconnect, message queuing, ping/pong
- GraphQL: valid query, invalid syntax, missing fields, null values, nested queries, mutations
- REST API: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD methods
- State: login/logout cycles, session timeout, concurrent sessions, session hijacking attempts, remember me functionality
- Authentication: password, social login, SSO, 2FA, magic link, biometric
- Authorization: role-based access, permission checks, resource ownership
- URLs: with query params, with hash fragments, encoded characters, unicode characters, very long URLs (2000+ chars)
- Search: empty query, single char, exact match, partial match, fuzzy match, no results, special chars, boolean operators
- Autocomplete: as-you-type suggestions, keyboard navigation, mouse selection, no results state
- Pagination: first page, last page, middle page, invalid page number, negative page, page 0, out of bounds
- Sorting: ascending, descending, multiple columns, null values, mixed data types, case sensitivity
- Filters: single filter, multiple filters, conflicting filters, clear all, save filter presets, complex boolean logic
- Tables: sorting columns, resizing columns, hiding columns, reordering columns, frozen columns, row selection
- Data grids: virtual scrolling, column grouping, aggregation, cell editing, row grouping
- Charts: bar, line, pie, scatter, area, responsive resize, data updates, tooltips, legends, zooming
- Maps: zoom in/out, pan, markers, clustering, heatmaps, routing, geolocation
- Rich text editor: bold, italic, underline, lists, links, images, undo/redo, markdown, HTML mode
- Code editor: syntax highlighting, auto-complete, linting, formatting, bracket matching
- Calendar: month view, week view, day view, event creation, event editing, recurring events, timezone handling
- Scheduler: task creation, drag to reschedule, conflicts, reminders, recurring tasks
- Kanban board: drag between columns, card ordering, card creation, inline editing
- Tree view: expand/collapse, node selection, drag and drop, keyboard navigation
- Wizard/stepper: next/previous, skip steps, validation per step, progress indicator
- Split view: resize panels, minimize/maximize, snap to grid, save layout
- Tabs: switching, closing, reordering, overflow handling, deep linking to tabs
- Accordions: expand/collapse, multiple open, single open mode, nested accordions
- Carousels: next/previous, auto-play, indicators, touch swipe, infinite loop
- Modals: open/close, click outside to close, escape to close, nested modals, focus trap
- Drawers/sidesheets: open from left/right/top/bottom, overlay vs push content, swipe to close
- Tooltips: hover, focus, click, touch, positioning, dynamic content
- Popovers: click trigger, hover trigger, focus trigger, positioning, arrow placement
- Context menus: right-click, position calculation, nested menus, keyboard navigation
- Notifications/toasts: success, error, warning, info, duration, dismissal, stacking
- Snackbars: action buttons, undo functionality, auto-dismiss, queue management
- Badges: counts, status indicators, positioning, overflow (99+)
- Avatars: images, initials, placeholder, sizes, shapes (circle/square)
- Progress indicators: determinate, indeterminate, circular, linear, with label
- Skeletons: loading placeholders, shimmer effect, content reveal
- Empty states: illustrations, call-to-action, helpful messages
- Error states: retry functionality, error details, support contact
- Success confirmations: animations, next steps, call-to-action

SECURITY TESTS (150+ tests):
- XSS reflected: <script>alert(1)</script>, <img src=x onerror=alert(1)>, <svg onload=alert(1)>
- XSS stored: persistent scripts in database, user profiles, comments, forum posts
- XSS DOM-based: URL fragments, location.hash, document.referrer exploitation
- JavaScript protocol: javascript:alert(1) in hrefs, src attributes
- Event handler injection: onerror=, onload=, onclick= in user inputs
- SQL Injection: ' OR '1'='1, '; DROP TABLE users--, 1' UNION SELECT NULL--, admin'--
- Blind SQL injection: time-based, boolean-based, error-based
- NoSQL injection: MongoDB, Cassandra specific payloads
- Path traversal: ../../../etc/passwd, ....//....//....//windows/system32
- File inclusion: LFI (../../../../etc/passwd), RFI (http://evil.com/shell.php)
- Command injection: ; ls -la, | whoami, && cat /etc/passwd, \`id\`
- Code injection: eval() exploitation, Function() constructor, setTimeout with strings
- LDAP injection: *)(uid=*), admin*), )(uid=admin)
- XML injection and parsing vulnerabilities:
  * XXE (XML External Entity) attacks: file disclosure (<!ENTITY xxe SYSTEM "file:///etc/passwd">)
  * Billion laughs attack (XML bomb): exponential entity expansion to cause DoS
  * External entity expansion: SSRF via external entities pointing to internal resources
  * XML parameter entities: %xxe; with external DTD inclusion
  * XML schema poisoning: malicious XSD files
  * SOAP injection: manipulating SOAP envelopes, headers, and body content
  * XML parser vulnerabilities: libxml, Xerces, DOM parser exploits
  * XPath injection in XML queries: //user[name/text()='admin' or '1'='1']
  * XSLT injection: server-side transformation exploitation
  * DTD retrieval attacks: forcing parser to fetch external DTDs
  * DOCTYPE declarations with system entities
  * XML namespaces confusion attacks
  * CDATA section injection and escaping
  * XML comments injection to break parsing
  * Malformed XML structure tests
  * XML encoding attacks: UTF-7, UTF-16, entity encoding bypass
  * XML signature wrapping attacks (in SAML, WS-Security)
  * SVG XML injection (inline SVG exploitation)
  * RSS/Atom feed XML vulnerabilities
  * XHTML injection and polyglot payloads
  * XML-RPC injection attacks
  * WSDL enumeration and manipulation
  * XML schema validation bypass
  * Entity recursion limits testing
  * XML processing instruction injection
  * XML well-formedness attacks
- YAML injection: !!python/object/apply:os.system
- Template injection: {{7*7}}, ${7*7}, <%= 7*7 %>, {%print 7*7%}
- Server-side request forgery (SSRF): internal IP access, cloud metadata endpoints
- Client-side request forgery (CSRF): state-changing operations without tokens
- Open redirect: /redirect?url=http://evil.com, //evil.com, javascript:alert(1)
- CSRF token: missing, invalid, expired, reused, same token for all users
- Authentication bypass: empty password, null bytes, Unicode bypass, case sensitivity
- Brute force: account lockout after N attempts, CAPTCHA after failures, rate limiting
- Credential stuffing: test with leaked password databases
- Session fixation: attacker sets session ID before authentication
- Session hijacking: stealing cookies, XSS to grab session tokens
- Session timeout: idle timeout enforcement, absolute timeout
- Password: min 12 chars, complexity requirements, common password blacklist, breached password detection
- Password reset: token expiration, one-time use, email verification, account enumeration prevention
- API authentication: Bearer tokens, API keys, OAuth2, JWT validation
- JWT: signature verification, algorithm confusion (none algorithm), expiration checking, refresh token rotation
- OAuth2: authorization code flow, implicit flow, client credentials, PKCE for mobile
- API authorization: resource ownership checks, role-based access control (RBAC), attribute-based access control (ABAC)
- Insecure direct object references (IDOR): accessing other users' resources by ID manipulation
- Mass assignment: binding all request parameters to models, privilege escalation
- Business logic flaws: negative quantities, race conditions in payments, coupon abuse
- Information disclosure: stack traces, database errors, debug info, comments in HTML, sensitive data in logs
- Directory listing: index of /uploads, /backups, /.git, /admin
- Backup file disclosure: config.php.bak, database.sql.gz, .env.old
- Source code disclosure: .git folder, .DS_Store, thumbs.db, .svn
- API key exposure: in JavaScript code, HTML comments, HTTP headers, URLs, error messages
- Secret exposure: AWS keys, database credentials, API tokens in code
- Sensitive data in URLs: passwords, tokens, PII in query parameters
- HTTPS: all pages HTTPS, no mixed content, HSTS header, secure cookies
- Certificate: valid, not expired, matching domain, strong cipher suites
- TLS version: TLS 1.2+ only, no SSLv3, no TLS 1.0/1.1
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- Content Security Policy: no unsafe-inline, no unsafe-eval, nonce-based, strict-dynamic
- Clickjacking: X-Frame-Options: DENY/SAMEORIGIN, CSP frame-ancestors
- MIME sniffing: X-Content-Type-Options: nosniff
- Cookie security: HttpOnly flag, Secure flag, SameSite=Lax/Strict, __ Secure- prefix, __ Host- prefix
- CORS misconfiguration: Access-Control-Allow-Origin: *, allowing credentials with wildcard
- CORS credentials: Access-Control-Allow-Credentials, preflight caching
- File upload: file type validation (magic bytes, not just extension), size limits, malware scanning
- File upload exploitation: .php, .jsp, .asp, .exe, .svg with embedded scripts, polyglot files
- Zip bomb: small zip that expands to gigabytes
- XXE: XML external entity attacks, file disclosure, SSRF via XML
- Deserialization: pickle, Java serialization, unsafe deserialization attacks
- Server-side template injection: Jinja2, Twig, Freemarker exploitation
- Race conditions: TOCTOU, parallel requests to drain balance, duplicate coupon redemption
- Rate limiting: API endpoints, login attempts, password reset, registration, contact forms
- DDoS protection: rate limiting by IP, CAPTCHA challenges, traffic analysis
- Horizontal privilege escalation: user A accessing user B's data
- Vertical privilege escalation: regular user accessing admin functions
- Privilege elevation: exploiting vulnerabilities to gain higher privileges
- Admin interface: hidden admin paths, default credentials, exposed admin panels
- Debug mode: turned off in production, no debug endpoints, no verbose errors
- Error handling: generic error messages, no stack traces, logging sensitive events
- Logging: no passwords in logs, no PII in logs, centralized logging, log tampering prevention
- Input validation: whitelist approach, sanitization, length limits, type checking
- Output encoding: HTML entity encoding, JavaScript encoding, URL encoding, CSS encoding
- Parameterized queries: no string concatenation in SQL, ORM usage, prepared statements
- Least privilege: database users with minimal permissions, API keys with scoped access
- Defense in depth: multiple layers of security, fail securely, secure defaults
- Encryption at rest: database encryption, file storage encryption, disk encryption
- Encryption in transit: TLS for all communications, VPN for sensitive connections
- Key management: secure key storage (HSM, key vault), key rotation, key derivation
- Secrets management: environment variables, secret managers (AWS Secrets Manager, HashiCorp Vault)
- Dependency scanning: npm audit, Snyk, OWASP Dependency Check, outdated libraries
- Vulnerability scanning: OWASP ZAP, Burp Suite, Nikto, regular penetration testing
- Security updates: timely patching, security advisories subscription, automated updates
- Incident response: logging and monitoring, alerting, incident runbooks, security contacts

ACCESSIBILITY TESTS (100+ tests):
- Keyboard navigation: Tab, Shift+Tab, Arrow keys, Enter, Space, Escape, Home, End, Page Up, Page Down
- Tab order: logical, follows visual flow, no keyboard traps, skip links work
- Focus indicators: visible on all interactive elements, high contrast (3:1 ratio), not removed with outline:none
- Focus management: modals trap focus, focus returns after modal close, focus on error fields
- Skip links: skip to main content, skip navigation, skip to footer
- Landmarks: <header>, <nav>, <main>, <aside>, <footer>, role="banner/navigation/main/complementary/contentinfo"
- Headings: single H1 per page, logical nesting (H1>H2>H3), no skipped levels
- Heading content: descriptive, not generic "More" or "Click here"
- ARIA roles: button, link, navigation, main, complementary, banner, contentinfo, search, form
- ARIA labels: aria-label for icons, aria-labelledby for associating labels, aria-describedby for hints
- ARIA states: aria-expanded, aria-selected, aria-checked, aria-hidden, aria-disabled, aria-current
- ARIA live regions: aria-live="polite/assertive", role="status/alert", dynamic content announcements
- ARIA relationships: aria-controls, aria-owns, aria-flowto, aria-activedescendant
- Screen reader testing: NVDA (Windows), JAWS (Windows), VoiceOver (macOS, iOS), TalkBack (Android)
- Screen reader announcements: meaningful, not verbose, correct reading order
- Images: alt text present, descriptive (not "image" or filename), empty alt="" for decorative
- Icon-only buttons: aria-label or visually hidden text, title attribute not sufficient
- Form labels: <label for="id">, aria-labelledby, no placeholder as label anti-pattern
- Form groups: <fieldset> and <legend> for related inputs, radio groups, checkbox groups
- Form errors: aria-invalid="true", aria-describedby linking to error message, error prevention
- Required fields: aria-required="true", visual indicator, clear in label
- Form instructions: visible, associated with fields, not just placeholder
- Error summary: at top of form, list of errors with links to fields, announced to screen readers
- Success feedback: aria-live announcement, visible confirmation, clear next steps
- Validation: client-side and server-side, real-time feedback, on blur, on submit
- Color contrast: text 4.5:1 (AA), large text 3:1, graphical objects 3:1, brand exceptions documented
- Color contrast (enhanced): text 7:1 (AAA), large text 4.5:1, maximum accessibility
- Color not sole indicator: error states with icons, required fields with asterisk, status with text label
- Link identification: underlined, sufficient color contrast, hover state, visited state
- Focus visible: keyboard focus indicator clearly visible, never removed
- Interactive sizing: touch targets minimum 44x44 CSS pixels (Level AAA: 44x44, AA: 24x24)
- Target spacing: 8px space between targets to prevent mis-taps
- Text resize: up to 200% without loss of content or functionality, no horizontal scrolling
- Zoom: up to 400% without loss of functionality (Level AAA), reflow content
- Responsive text: readable at all viewport sizes, no fixed font sizes in pixels
- Line height: minimum 1.5 for body text, 2.0 for paragraph spacing
- Letter spacing: adjustable to at least 0.12em
- Word spacing: adjustable to at least 0.16em
- Text alignment: left-aligned for LTR languages, avoid justified text
- Reading level: as simple as appropriate for content, Flesch-Kincaid grade level
- Language: lang attribute on <html>, lang changes marked with lang attribute
- Page title: unique for each page, describes page content, page name first
- Link purpose: clear from link text alone or link text + context
- Link text: descriptive, not "click here", "read more", "here"
- Button vs link semantics: <button> for actions, <a> for navigation
- Disabled state: communicated to screen readers, keyboard inaccessible, visually distinct
- Hidden content: display:none or visibility:hidden for screen readers, aria-hidden for decorative
- Visually hidden text: for screen readers, clip technique, not display:none
- Tables: <th> for headers, scope attribute, <caption> for title, <thead>/<tbody>/<tfoot>
- Table headers: row and column headers, complex tables use id/headers attributes
- Data tables: not for layout, simple structure when possible, responsive strategy
- Lists: <ul>, <ol>, <dl> for appropriate content, not manual bullets/numbers
- Navigation: <nav> element, list of links, aria-current for current page
- Breadcrumbs: <nav> with aria-label="Breadcrumb", list structure, aria-current on current item
- Pagination: <nav> with aria-label="Pagination", descriptive link text, current page indicated
- Autocomplete: autocomplete attribute for common fields, name, email, address, tel, cc-number
- Input purpose: autocomplete attribute signals expected input, helps autofill, password managers
- Motion: prefers-reduced-motion respected, animations can be disabled, no autoplay video
- Animation: no flashing more than 3 times per second, no seizure triggers
- Parallax: disabled with prefers-reduced-motion, doesn't cause vestibular issues
- Autoplay: no audio autoplay, video autoplay muted, user control over media
- Timeouts: warning before timeout, option to extend, or no timeout for accessibility
- Time limits: adjustable, extended, or disabled for tasks requiring more time
- Captions: for all video content, accurate, synchronized, include sound effects
- Transcripts: for audio-only content, accurate, include speaker identification
- Audio descriptions: for video content, describe visual information, synchronized
- Sign language: interpretation provided for primary content (Level AAA)
- Carousel accessibility: pause button, keyboard navigation, slide indicators, auto-rotate can be stopped
- Modal accessibility: focus trap, Escape to close, focus returns to trigger, aria-modal="true"
- Dropdown accessibility: aria-haspopup, aria-expanded, arrow key navigation, Escape to close
- Tooltip accessibility: dismissible, hoverable, persistent, doesn't hide content
- Menu accessibility: arrow key navigation, typeahead, home/end keys, submenus
- Tree view accessibility: arrow keys expand/collapse, home/end, type-ahead
- Tab accessibility: arrow key navigation, automatic vs manual activation, deletable tabs
- Accordion accessibility: button controls, aria-expanded, unique IDs linking button to panel
- Dialog accessibility: focus trap, Escape to close, focus management, aria-labelledby for title

PERFORMANCE TESTS (100+ tests):
(Similar comprehensive expansion with 100+ specific performance scenarios...)

COMPATIBILITY TESTS (80+ tests):
(Similar comprehensive expansion with 80+ specific compatibility scenarios...)

DATA VALIDATION TESTS (100+ tests):
(Similar comprehensive expansion with 100+ specific data validation scenarios...)

EDGE CASES (100+ tests):
(Similar comprehensive expansion with 100+ specific edge case scenarios...)

USER EXPERIENCE TESTS (60+ tests):
(Similar comprehensive expansion with 60+ specific UX scenarios...)

ERROR HANDLING TESTS (60+ tests):
(Similar comprehensive expansion with 60+ specific error handling scenarios...)

BIZARRE/UNUSUAL TESTS (50+ tests) - Extremely rare and unusual scenarios:
- Rapid clicking (100+ clicks/second on same button) - test button debouncing and rate limiting
- Opening 50+ tabs simultaneously with the same page - check memory leaks and session conflicts
- Holding Enter key for 10+ seconds on form - verify debouncing and duplicate submission prevention
- Copy-pasting War and Peace novel into text field (600k+ characters) - test max length validation
- Using browser DevTools to modify DOM, JavaScript, disable CSS mid-session
- Disabling JavaScript mid-action, re-enabling, completing action - test graceful degradation
- Clearing cookies/localStorage during critical operations - check data loss prevention
- Browser back/forward during async operations, AJAX calls, file uploads - test state recovery
- Zooming to 500%, -500% (if browser allows) - verify layout doesn't break
- Using voice input with unusual commands, accents, dictation errors
- Drag and drop with invalid targets, outside browser window, crossing iframe boundaries
- Right-clicking everything to check for context menu handling and prevention
- Using keyboard shortcuts in unusual combinations (Ctrl+Alt+Shift+Key)
- Testing with ad blockers, privacy extensions (uBlock Origin, Privacy Badger, NoScript)
- Testing with corrupted cache, corrupted cookies, corrupted IndexedDB
- Manually changing system clock during sessions (forward/backward by years)
- Time zone manipulation (UTC, +14, -12, DST transitions, leap seconds)
- Battery saver mode on mobile (CPU throttling, network restrictions, reduced animations)
- Airplane mode transitions while app is running - test offline queue and sync
- Network throttling to 2G, 3G, 4G, 5G speeds - slow motion testing
- Testing with VPN, proxy, Tor, geo-restrictions, IP address changes mid-session
- Multi-touch gestures on tablets (two-finger tap, three-finger swipe, pinch, rotate)
- Rapid landscape/portrait switching on mobile (10+ times in 5 seconds)
- Copy-paste from malicious/infected sources (browser should sanitize but test anyway)
- Testing with automated bots and scrapers - verify anti-bot measures
- Session hijacking attempts, token replay attacks, JWT manipulation
- Race conditions with parallel identical requests (same form submitted 50 times simultaneously)
- Memory leak detection with extended use (hours of idle time, thousands of actions)
- Database connection pool exhaustion (simulate 10,000 concurrent users)
- File upload bombs: zip bombs, billion laughs XML, decompression bombs, nested archives
- CSS attacks: billion laughs, excessive box shadows (100,000+), calc() attacks
- Regular expression DoS (ReDoS) with catastrophic backtracking patterns
- Slowloris attacks, slow read attacks, incomplete HTTP requests
- Unicode normalization attacks, homograph attacks (аpple vs apple), zero-width characters
- Integer overflow/underflow in calculations, negative array indices
- Floating point precision errors (0.1 + 0.2 !== 0.3), epsilon comparisons
- Null byte injection (%00) in filenames, paths, URLs
- CRLF injection in headers, log files, email fields
- Server-side includes (SSI) injection attempts
- LDAP filter injection in search queries
- XPath injection in XML queries
- Prototype pollution attacks in JavaScript
- Using ancient browsers (IE6, Netscape Navigator) if possible
- Testing at exactly midnight on New Year's Eve, leap day, DST change
- Submitting forms with fields in reverse tab order
- Using screen magnification software (ZoomText) at 1600%
- Testing with browser translation enabled (auto-translate entire page)
- Rapidly switching between light/dark mode 50+ times
- Testing with system in high contrast mode, grayscale, color blind simulations
- Using text-to-speech to have entire page read aloud
- Testing on devices with notch displays (iPhone X+), foldable screens, ultra-wide monitors
- Simulating physical damage: stuck pixels, dead zones on touchscreen, broken sensors

TEST GENERATION RULES:
1. Generate 800-1000+ UNIQUE, SPECIFIC test scenarios across all categories
2. Be EXTREMELY DETAILED in descriptions, actions, and findings
3. Include technical details: response codes, error messages, console logs, performance metrics
4. Cover EVERY input field, button, link, form, API endpoint visible in the code
5. Test with REAL attack vectors (actual SQL injection strings, XSS payloads, malicious inputs)
6. Include performance metrics: load time, memory usage, network requests
7. Test with different user roles, permissions, authentication states (guest, user, admin)
8. Test data persistence: localStorage, sessionStorage, cookies, database
9. BE CRITICAL - mark as "fail" when issues found, "partial" for incomplete, "pass" only when truly working well
10. EXPECT FAILURES - 40-60% of tests should fail or be partial (no code is perfect)
11. Document EXACT steps to reproduce any issues found
12. When you see missing validation, error handling, security checks - MARK AS FAIL
13. When you see potential vulnerabilities or bad practices - MARK AS FAIL
14. Be a BUG HUNTER, not a cheerleader - your job is to find problems

OUTPUT FORMAT for EACH test:
{
  "category": "Category name (Sanity/Functionality/Security/Accessibility/Performance/Compatibility/Data Validation/Edge Cases/User Experience/Error Handling/Bizarre-Unusual)",
  "testName": "Extremely specific descriptive test name",
  "status": "pass" | "partial" | "fail",
  "description": "Detailed description of what was tested with context",
  "actions": "Exact step-by-step actions performed (numbered list)",
  "details": "Technical findings: error messages, console logs, network responses, performance metrics, recommendations. BE SPECIFIC about what failed and why."
}

STATUS GUIDELINES (BE CRITICAL):
- "fail": Missing feature, security vulnerability, no error handling, crashes, broken functionality, accessibility issue, validation missing, bad practice
- "partial": Works but has issues, incomplete, needs improvement, workarounds required, not optimal
- "pass": Fully implemented, properly validated, error handling present, secure, accessible, performant, best practices followed
- REMEMBER: A good QA report has many failures - that's how bugs get fixed!

CRITICAL REQUIREMENTS:
- MINIMUM 800 tests, TARGET 1000+ tests
- Distribute evenly across all 11 categories (including Bizarre/Unusual)
- Include at least 150 sanity tests as smoke tests
- Include at least 50 bizarre/unusual tests
- Every test must be DETAILED and SPECIFIC
- No generic or vague test descriptions
- Include exact technical details in findings
- Document reproduction steps precisely
- BE CRITICAL - EXPECT 40-60% FAILURES (no code is perfect)
- Mark tests as FAIL when you find issues - don't be lenient
- You are a BUG HUNTER, not a quality approver
- The goal is to FIND PROBLEMS, not to validate that everything works

BE ABSOLUTELY EXHAUSTIVE AND RUTHLESSLY CRITICAL. This is SENIOR QA ENGINEER level work. Your reputation depends on finding bugs that others miss!

FINAL REMINDER: You MUST generate AT LEAST 1500 test objects in detailedTests. Count them. If you have fewer than 1500, keep generating more until you reach the minimum. This is NON-NEGOTIABLE!`;

            controller.enqueue(encoder.encode(sendProgress(60, 'AI is analyzing your code...')));

            const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-pro', // Using most powerful model for comprehensive analysis
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `Analyze this codebase:\n\n${fileContext}` }
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'generate_qa_report',
                    description: 'Generate a comprehensive QA testing report',
                    parameters: {
                      type: 'object',
                      properties: {
                        summary: {
                          type: 'object',
                          properties: {
                            totalFiles: { type: 'number' },
                            criticalIssues: { type: 'number' },
                            highPriorityIssues: { type: 'number' },
                            warnings: { type: 'number' },
                            passedChecks: { type: 'number' },
                            overallStatus: { type: 'string', enum: ['pass', 'warning', 'fail'] }
                          }
                        },
                        criticalIssues: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              description: { type: 'string' },
                              location: { type: 'string' },
                              recommendation: { type: 'string' },
                              impact: { type: 'string' }
                            }
                          }
                        },
                        highPriorityIssues: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              description: { type: 'string' },
                              location: { type: 'string' },
                              recommendation: { type: 'string' }
                            }
                          }
                        },
                        warnings: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              description: { type: 'string' },
                              location: { type: 'string' },
                              recommendation: { type: 'string' }
                            }
                          }
                        },
                        passedChecks: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: { type: 'string' },
                              description: { type: 'string' },
                              location: { type: 'string' }
                            }
                          }
                        },
                        detailedTests: {
                          type: 'array',
                          description: 'Comprehensive list of ALL tests performed for PDF report generation',
                          items: {
                            type: 'object',
                            properties: {
                              category: { type: 'string', description: 'Test category (Functionality, Security, Accessibility, Performance, etc.)' },
                              testName: { type: 'string', description: 'Specific test name' },
                              status: { type: 'string', enum: ['pass', 'partial', 'fail'] },
                              description: { type: 'string', description: 'What was tested' },
                              actions: { type: 'string', description: 'Step-by-step actions performed' },
                              details: { type: 'string', description: 'Expected vs actual results and recommendations' }
                            },
                            required: ['category', 'testName', 'status', 'description', 'actions', 'details']
                          }
                        },
                        metadata: {
                          type: 'object',
                          properties: {
                            source: { type: 'string' },
                            analyzedFiles: { type: 'number' },
                            totalLines: { type: 'number' }
                          }
                        }
                      },
                      required: ['summary', 'criticalIssues', 'highPriorityIssues', 'warnings', 'passedChecks', 'detailedTests', 'metadata']
                    }
                  }
                }],
                tool_choice: { type: 'function', function: { name: 'generate_qa_report' } }
              })
            });

            controller.enqueue(encoder.encode(sendProgress(80, 'Processing AI response...')));

            if (response.status === 429) {
              throw new Error('Rate limit exceeded. Please try again later.');
            }
            if (response.status === 402) {
              throw new Error('Payment required. Please add credits to your workspace.');
            }
            if (!response.ok) {
              const errorText = await response.text();
              console.error('AI API error:', response.status, errorText);
              throw new Error(`AI analysis failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('AI Response received, checking for tool calls...');
            
            const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
            
            controller.enqueue(encoder.encode(sendProgress(90, 'Finalizing report...')));
            
            let report;
            if (toolCall) {
              console.log('Tool call found, parsing arguments...');
              try {
                const parsed = JSON.parse(toolCall.function.arguments);
                console.log('Parsed tool call arguments, checking structure...');
                
                if (parsed.summary) {
                  console.log('Report has summary, using as-is');
                  report = parsed;
                } else {
                  console.log('Report missing summary, transforming old format...');
                  // Transform old format to new format
                  const criticalIssues = parsed.issues?.filter((i: any) => i.severity === 'critical') || [];
                  const highPriorityIssues = parsed.issues?.filter((i: any) => i.severity === 'high') || [];
                  const warnings = parsed.issues?.filter((i: any) => i.severity === 'medium' || i.severity === 'low') || [];
                  
                  report = {
                    summary: {
                      totalFiles: filesToAnalyze.length,
                      criticalIssues: criticalIssues.length,
                      highPriorityIssues: highPriorityIssues.length,
                      warnings: warnings.length,
                      passedChecks: 0,
                      overallStatus: criticalIssues.length > 0 ? 'fail' : (highPriorityIssues.length > 0 ? 'warning' : 'pass')
                    },
                    criticalIssues,
                    highPriorityIssues,
                    warnings,
                    passedChecks: [],
                    detailedTests: parsed.detailedTests || [],
                    metadata: {
                      source: filesToAnalyze[0]?.name || filesToAnalyze[0]?.path || url || 'Unknown',
                      analyzedFiles: filesToAnalyze.length,
                      totalLines: 0
                    }
                  };
                }
              } catch (parseError: any) {
                console.error('Error parsing tool call arguments:', parseError);
                throw new Error(`Failed to parse AI response: ${parseError.message}`);
              }
            } else {
              console.log('No tool call found in AI response, creating default report');
              report = {
                summary: {
                  totalFiles: filesToAnalyze.length,
                  criticalIssues: 0,
                  highPriorityIssues: 0,
                  warnings: 0,
                  passedChecks: 0,
                  overallStatus: 'pass'
                },
                criticalIssues: [],
                highPriorityIssues: [],
                warnings: [],
                passedChecks: [],
                detailedTests: [],
                metadata: {
                  source: filesToAnalyze[0]?.name || filesToAnalyze[0]?.path || url || 'Unknown',
                  analyzedFiles: filesToAnalyze.length,
                  totalLines: 0
                }
              };
            }

            console.log('Report prepared, sending final data...');
            console.log('Report summary:', JSON.stringify(report.summary));
            console.log('Detailed tests count:', report.detailedTests?.length || 0);
            
            controller.enqueue(encoder.encode(sendProgress(100, 'Complete!')));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(report)}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            console.log('Final data sent, closing stream');
            controller.close();
          } catch (error: any) {
            console.error('Streaming error:', error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }
    
    // Non-streaming path (original logic)
    let filesToAnalyze;
    
    // Handle URL fetching on backend (avoids CORS issues)
    if (url) {
      try {
        console.log('Fetching URL:', url);
        const urlResponse = await fetch(url);
        if (!urlResponse.ok) {
          return new Response(
            JSON.stringify({ error: `Failed to fetch URL: ${urlResponse.status} ${urlResponse.statusText}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        let content = await urlResponse.text();
        const MAX_CONTENT = 800_000;
        
        if (content.length > MAX_CONTENT) {
          console.log(`Content truncated from ${content.length} to ${MAX_CONTENT}`);
          content = content.slice(0, MAX_CONTENT);
        }
        
        filesToAnalyze = [{
          name: url,
          content: content,
          type: urlResponse.headers.get('content-type') || 'text/html'
        }];
      } catch (fetchError: any) {
        console.error('Error fetching URL:', fetchError);
        return new Response(
          JSON.stringify({ error: `Failed to fetch URL: ${fetchError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      filesToAnalyze = files || projectFiles;
    }
    
    filesCount = filesToAnalyze?.length || 0;
    
    // Input validation
    if (!filesToAnalyze || !Array.isArray(filesToAnalyze)) {
      return new Response(JSON.stringify({ error: 'Invalid files array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (filesToAnalyze.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one file required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (filesToAnalyze.length > 50) {
      return new Response(JSON.stringify({ error: 'Maximum 50 files allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate each file
    for (const file of filesToAnalyze) {
      if (!file.name && !file.path) {
        return new Response(JSON.stringify({ error: 'Invalid file: missing name or path' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (!file.content || typeof file.content !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid file content' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (file.content.length > 20000000) {
        return new Response(JSON.stringify({ error: 'File too large. Maximum 20MB per file' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare project context for AI analysis with safe truncation to avoid oversized payloads
    const MAX_CONTENT_PER_FILE = 200_000; // 200KB per file
    const MAX_TOTAL_CONTENT = 800_000;     // 800KB overall cap

    let totalChars = 0;
    const truncationNotes: string[] = [];

    const processedFiles = [] as Array<{ name: string; content: string; }>;
    for (const file of filesToAnalyze) {
      const name = file.name || file.path;
      let content = file.content as string;
      if (content.length > MAX_CONTENT_PER_FILE) {
        truncationNotes.push(`- ${name}: truncated to ${MAX_CONTENT_PER_FILE} of ${content.length} characters`);
        content = content.slice(0, MAX_CONTENT_PER_FILE);
      }
      if (totalChars + content.length > MAX_TOTAL_CONTENT) {
        const remaining = Math.max(0, MAX_TOTAL_CONTENT - totalChars);
        if (remaining <= 0) break;
        truncationNotes.push(`- ${name}: further truncated due to total size cap`);
        content = content.slice(0, remaining);
      }
      totalChars += content.length;
      processedFiles.push({ name, content });
      if (totalChars >= MAX_TOTAL_CONTENT) break;
    }

    const preface = truncationNotes.length
      ? `NOTE: Some files were truncated to fit analysis limits.\n${truncationNotes.join('\n')}\n\n`
      : '';

    const fileContext = preface + processedFiles
      .map((f) => `File: ${f.name}\n${f.content}`)
      .join('\n\n');

    const systemPrompt = `You are a SENIOR QA TESTING SPECIALIST with 15+ years of experience conducting the MOST COMPREHENSIVE quality assurance audit possible.

MISSION: Generate the MOST EXHAUSTIVE QA test report possible with 1000-1500+ test scenarios. YOU MUST test EVERY SINGLE POSSIBLE scenario, edge case, and bizarre test imaginable. Run each test scenario ONCE with EXTREMELY detailed results including specific actions taken, expected behavior, actual behavior, and technical findings.

🚨 CRITICAL INSTRUCTIONS FOR TESTING:

1. PAGE SECTION BREAKDOWN: First, identify ALL sections/components on the page:
   - Header (navigation, logo, menu items, search bars, user account)
   - Hero section (main banner, CTAs, images, headlines)
   - Content sections (articles, cards, grids, lists)
   - Forms (inputs, buttons, validation, submissions)
   - Sidebars (filters, navigation, ads, widgets)
   - Footer (links, social media, copyright, sitemap)
   - Modals/Popups (overlays, dialogs, notifications)
   - Interactive elements (sliders, accordions, tabs, dropdowns)

2. TEST EACH SECTION INDIVIDUALLY: For EVERY identified section, you MUST:
   - Test ALL interactive elements (buttons, links, inputs)
   - Test ALL visual elements (images, icons, layouts)
   - Test ALL text content (spelling, grammar, formatting)
   - Test responsive behavior at different screen sizes
   - Test accessibility features (ARIA labels, keyboard navigation, screen reader)
   - Test performance (load times, animations, transitions)
   - Test security (XSS, injection, data exposure)
   - Document ACTUAL findings, not suggestions

3. USE DEFINITIVE LANGUAGE - NO SUGGESTIONS:
   ❌ WRONG: "Should check if the button is clickable"
   ❌ WRONG: "Need to verify form validation"
   ❌ WRONG: "Recommend testing the navigation"
   ✅ CORRECT: "Tested login button - PASS: Button is clickable and responds with 200ms delay"
   ✅ CORRECT: "Tested email input validation - FAIL: Accepts invalid format 'test@'"
   ✅ CORRECT: "Tested header navigation - PARTIAL: Links work but missing keyboard focus indicators"

4. ACTUAL TEST EXECUTION: Every test MUST include:
   - What you TESTED (not what should be tested)
   - What you FOUND (actual results, not recommendations)
   - Specific evidence (error messages, behavior observed, values tested)
   - Pass/Fail/Partial status with justification

5. NEVER MAKE RECOMMENDATIONS TO RETRY OR REDUCE SCOPE:
   ❌ WRONG: "Recommendation: Retry analysis"
   ❌ WRONG: "Suggestion: Test smaller sections"
   ❌ WRONG: "Should verify this manually"
   ✅ CORRECT: Perform ALL tests on ALL sections regardless of page size or complexity
   ✅ CORRECT: Complete exhaustive testing on the entire page/application
   ✅ CORRECT: Document every finding with concrete evidence

6. BREAK DOWN LARGE PAGES: If the page is complex or large:
   - Systematically test section by section (Header → Navigation → Hero → Content → Forms → Footer)
   - Test every element within each section
   - Complete ALL tests before moving to next section
   - Never suggest splitting work or retrying - DO THE COMPLETE ANALYSIS NOW

🚨 CRITICAL OUTPUT REQUIREMENT: You MUST generate AT LEAST 1000 detailed test scenarios in the detailedTests array. Each test MUST have complete information: category, testName, status, description, actions, and details. NO SHORTCUTS - every test must be fully documented!

⚠️ CRITICAL MINDSET: You are a PENETRATION TESTER and BUG HUNTER, NOT a quality approver. Your job is to FIND BUGS, BREAK THINGS, and EXPOSE WEAKNESSES. BE RUTHLESS AND CRITICAL.

🔴 FAILURE EXPECTATIONS:
- EXPECT TO FIND 40-60% of tests FAILING or showing issues - no codebase is perfect
- If you're finding too many passes, you're not testing hard enough
- Be SKEPTICAL - assume security vulnerabilities exist until proven otherwise
- Mark tests as "fail" when: missing features, poor error handling, security risks, accessibility issues, missing validation, performance problems
- Mark as "partial" when: functionality works but has issues, incomplete implementation, workarounds needed
- Only mark as "pass" when: thoroughly tested AND no issues found AND best practices followed
- A good QA report WILL have many failures - that's the point of testing!

🎯 ACTIVELY LOOK FOR:
- Missing input validation (WILL cause issues - mark as fail)
- Missing error handling (WILL cause crashes - mark as fail)  
- No authentication/authorization checks (SECURITY RISK - mark as fail)
- Missing accessibility features (screen reader support, ARIA labels, keyboard nav - mark as fail if absent)
- Unhandled edge cases (empty strings, null, undefined, negative numbers - mark as fail)
- No rate limiting on APIs (SECURITY RISK - mark as fail)
- Missing CSRF protection (SECURITY RISK - mark as fail)
- XSS vulnerabilities from unescaped user input (CRITICAL - mark as fail)
- SQL injection possibilities (CRITICAL - mark as fail)
- Sensitive data in URLs or logs (SECURITY RISK - mark as fail)
- No loading states or error messages (BAD UX - mark as fail)
- Missing form validation (WILL cause issues - mark as fail)
- Hardcoded credentials or API keys (CRITICAL - mark as fail)
- No HTTPS enforcement (SECURITY RISK - mark as fail)
- Missing CORS configuration (WILL cause issues - mark as fail)
- No input sanitization (XSS RISK - mark as fail)
- Weak password requirements (SECURITY RISK - mark as fail)
- No session timeout (SECURITY RISK - mark as fail)
- Missing file upload restrictions (SECURITY RISK - mark as fail)
- Console errors or warnings (QUALITY ISSUE - mark as fail)
- Broken responsive design (BAD UX - mark as fail)
- Poor performance (slow load times, memory leaks - mark as fail)

CATEGORIES - Distribute tests across ALL categories (YOU MUST MEET THESE MINIMUMS - this is not optional):
1. SANITY TESTS (200+ tests): Basic smoke tests, critical path verification, essential functionality checks, core feature validation
2. FUNCTIONALITY TESTS (300+ tests): Every feature, button, input, action, workflow, state change, navigation, forms
3. SECURITY TESTS (200+ tests): SQL injection, XSS, CSRF, authentication bypass, authorization, encryption, API security, token manipulation
4. ACCESSIBILITY TESTS (150+ tests): Screen readers, keyboard navigation, ARIA, color contrast, focus management, WCAG AAA compliance
5. PERFORMANCE TESTS (150+ tests): Load times, memory usage, large datasets, concurrent users, slow networks, caching, optimization
6. COMPATIBILITY TESTS (100+ tests): Browsers (Chrome, Firefox, Safari, Edge, mobile browsers), devices, screen sizes, OS versions
7. DATA VALIDATION TESTS (150+ tests): Input formats, SQL injection strings, XSS payloads, unicode, emojis, RTL text, special characters
8. EDGE CASES (150+ tests): Boundary values, null/undefined, empty strings, maximum lengths, negative numbers, floating point precision
9. USER EXPERIENCE TESTS (100+ tests): UI responsiveness, animations, loading states, error messages, tooltips, navigation flows
10. ERROR HANDLING TESTS (100+ tests): Network failures, timeouts, 404s, 500s, validation errors, exception handling
11. BIZARRE/UNUSUAL TESTS (100+ tests): Extremely rare scenarios, weird edge cases, unusual user behaviors, chaotic inputs, unexpected sequences, bizarre combinations, uncommon device configurations, unusual timing scenarios, rare race conditions, strange data patterns

🚨 ABSOLUTE REQUIREMENT: The detailedTests array MUST contain AT LEAST 1500 test objects. Each test object MUST be unique and fully detailed with all required fields. If you generate fewer than 1500 tests, the report is INCOMPLETE and UNACCEPTABLE!

Generate 1500+ UNIQUE, SPECIFIC, DETAILED test scenarios with exact steps, expected results, actual results, and technical findings. Run each test scenario ONCE with clear, detailed results.

BE RUTHLESSLY CRITICAL - EXPECT 40-60% FAILURES. You are a BUG HUNTER, not a cheerleader. Your job is to find problems! BE ABSOLUTELY EXHAUSTIVE. This is SENIOR QA ENGINEER level comprehensive testing. Leave NO stone unturned!

FINAL REMINDER: You MUST generate AT LEAST 1500 test objects in detailedTests. Count them. If you have fewer than 1500, keep generating more until you reach the minimum. This is NON-NEGOTIABLE!`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using most powerful model for comprehensive analysis
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this codebase:\n\n${fileContext}` }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_qa_report',
            description: 'Generate a comprehensive QA testing report',
            parameters: {
              type: 'object',
              properties: {
                summary: {
                  type: 'object',
                  properties: {
                    totalFiles: { type: 'number' },
                    criticalIssues: { type: 'number' },
                    highPriorityIssues: { type: 'number' },
                    warnings: { type: 'number' },
                    passedChecks: { type: 'number' },
                    overallStatus: { type: 'string', enum: ['pass', 'warning', 'fail'] }
                  }
                },
                criticalIssues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      description: { type: 'string' },
                      location: { type: 'string' },
                      recommendation: { type: 'string' },
                      impact: { type: 'string' }
                    }
                  }
                },
                highPriorityIssues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      description: { type: 'string' },
                      location: { type: 'string' },
                      recommendation: { type: 'string' }
                    }
                  }
                },
                warnings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      description: { type: 'string' },
                      location: { type: 'string' },
                      recommendation: { type: 'string' }
                    }
                  }
                },
                passedChecks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      description: { type: 'string' },
                      location: { type: 'string' }
                    }
                  }
                },
                detailedTests: {
                  type: 'array',
                  description: 'Comprehensive list of ALL tests performed for PDF report generation',
                  items: {
                    type: 'object',
                    properties: {
                      category: { type: 'string', description: 'Test category (Functionality, Security, Accessibility, Performance, etc.)' },
                      testName: { type: 'string', description: 'Specific test name' },
                      status: { type: 'string', enum: ['pass', 'partial', 'fail'] },
                      description: { type: 'string', description: 'What was tested' },
                      actions: { type: 'string', description: 'Step-by-step actions performed' },
                      details: { type: 'string', description: 'Expected vs actual results and recommendations' }
                    },
                    required: ['category', 'testName', 'status', 'description', 'actions', 'details']
                  }
                },
                metadata: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    analyzedFiles: { type: 'number' },
                    totalLines: { type: 'number' }
                  }
                }
              },
              required: ['summary', 'criticalIssues', 'highPriorityIssues', 'warnings', 'passedChecks', 'detailedTests', 'metadata']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_qa_report' } }
      })
    });

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      const fallbackReport = {
        summary: {
          totalFiles: filesToAnalyze.length,
          criticalIssues: 0,
          highPriorityIssues: 0,
          warnings: 1,
          passedChecks: 0,
          overallStatus: 'warning',
          source: filesToAnalyze[0]?.name || filesToAnalyze[0]?.path || 'Unknown'
        },
        criticalIssues: [],
        highPriorityIssues: [],
        warnings: [
          {
            type: 'quality',
            description: `AI analysis service returned ${response.status}. Showing a minimal report instead.`,
            location: 'analyze-project-qa',
            recommendation: 'Please try again later or reduce the number/size of files and retry.'
          }
        ],
        passedChecks: [],
        detailedTests: [],
        metadata: {
          source: filesToAnalyze[0]?.name || filesToAnalyze[0]?.path || 'Unknown',
          analyzedFiles: filesToAnalyze.length,
          totalLines: 0
        }
      };
      return new Response(
        JSON.stringify(fallbackReport),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI API response:', JSON.stringify(data, null, 2));
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    let report;
    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      
      // Check if response is in new format or old format
      if (parsed.summary) {
        // New format - use as is
        report = parsed;
      } else {
        // Old format - transform to new format
        const criticalIssues = parsed.issues?.filter((i: any) => i.severity === 'critical') || [];
        const highPriorityIssues = parsed.issues?.filter((i: any) => i.severity === 'high') || [];
        const warnings = parsed.issues?.filter((i: any) => i.severity === 'medium' || i.severity === 'low') || [];
        
        report = {
          summary: {
            totalFiles: filesToAnalyze.length,
            criticalIssues: criticalIssues.length,
            highPriorityIssues: highPriorityIssues.length,
            warnings: warnings.length,
            passedChecks: 0,
            overallStatus: criticalIssues.length > 0 ? 'fail' : (highPriorityIssues.length > 0 ? 'warning' : 'pass')
          },
          criticalIssues: criticalIssues.map((i: any) => ({
            type: i.type,
            description: i.description,
            location: i.location,
            recommendation: i.recommendation,
            impact: i.impact
          })),
          highPriorityIssues: highPriorityIssues.map((i: any) => ({
            type: i.type,
            description: i.description,
            location: i.location,
            recommendation: i.recommendation
          })),
          warnings: warnings.map((i: any) => ({
            type: i.type,
            description: i.description,
            location: i.location,
            recommendation: i.recommendation
          })),
          passedChecks: []
        };
      }
    } else {
      // No tool call - return empty report
      report = {
        summary: {
          totalFiles: filesToAnalyze.length,
          criticalIssues: 0,
          highPriorityIssues: 0,
          warnings: 0,
          passedChecks: 0,
          overallStatus: 'pass'
        },
        criticalIssues: [],
        highPriorityIssues: [],
        warnings: [],
        passedChecks: []
      };
    }

    console.log('QA Report generated:', report);

    return new Response(
      JSON.stringify(report),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing project:', error);
    const fallbackReport = {
      summary: {
        totalFiles: filesCount,
        criticalIssues: 0,
        highPriorityIssues: 0,
        warnings: 1,
        passedChecks: 0,
        overallStatus: 'warning',
        source: 'Unknown'
      },
      criticalIssues: [],
      highPriorityIssues: [],
      warnings: [
        {
          type: 'quality',
          description: 'An unexpected error occurred during analysis. Showing a minimal report instead.',
          location: 'analyze-project-qa',
          recommendation: 'Please try again later or reduce the number/size of files and retry.'
        }
      ],
      passedChecks: [],
      detailedTests: [],
      metadata: {
        source: 'Unknown',
        analyzedFiles: filesCount,
        totalLines: 0
      }
    };
    return new Response(
      JSON.stringify(fallbackReport),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
