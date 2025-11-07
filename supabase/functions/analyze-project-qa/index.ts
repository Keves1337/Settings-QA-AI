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
            const systemPrompt = `You are an expert QA automation engineer. Analyze the provided files and generate the MOST COMPREHENSIVE, EXHAUSTIVE, and EXTREME QA test report possible.
    
    **CRITICAL INSTRUCTION**: Generate AT LEAST 50-100+ test scenarios. Include EVERY possible test you can think of, even the most bizarre, edge-case, and unusual scenarios. Test EVERYTHING including but not limited to:
    
    FUNCTIONALITY TESTS (Test ALL of these):
    - Every single button, link, form field, checkbox, radio button
    - Navigation: forward, back, refresh, direct URL entry
    - Forms: empty submission, max length, special characters, emojis, SQL-like strings
    - Inputs: negative numbers, decimal precision, leading zeros, scientific notation
    - Text fields: 0 chars, 1 char, max chars, max+1 chars, only spaces, only special chars
    - Dropdowns: first item, last item, middle item, no selection
    - Multi-select: none, one, all, maximum allowed
    - Date pickers: past dates, future dates, leap years, Feb 29, invalid dates, year 1900, year 2100
    - Time inputs: midnight, noon, 23:59, invalid times, different timezones
    - File uploads: 0 bytes, max size, oversized, wrong format, corrupted files, zero-byte files
    - Drag and drop: partial drag, cancel drag, drag to invalid area, multiple simultaneous drags
    - Copy/paste: empty clipboard, huge clipboard content, binary data, formatted text
    - Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+S, F5, Escape
    - Mouse: single click, double click, triple click, right click, middle click, scroll wheel
    - Touch: single tap, double tap, long press, swipe, pinch zoom, rotate
    - Browser back button after form submission
    - Browser refresh during operation
    - Opening links in new tab/window
    - Printing pages
    - Page zoom: 50%, 100%, 200%, 400%
    - Window resize: minimum size, maximum size, during operation
    - Network: slow 3G, offline mode, intermittent connection, packet loss
    - API: success, 400, 401, 403, 404, 500, timeout, malformed response
    - State: login/logout cycles, session timeout, concurrent sessions
    - URLs: with query params, with hash fragments, encoded characters, very long URLs
    - Search: empty query, single char, exact match, partial match, no results, special chars
    - Pagination: first page, last page, middle page, invalid page number, negative page
    - Sorting: ascending, descending, multiple columns, null values
    - Filters: single filter, multiple filters, conflicting filters, clear all
    - Autocomplete: no results, single result, many results, special characters
    
    SECURITY TESTS (Test ALL attack vectors):
    - XSS: <script>alert(1)</script>, javascript:, onerror=, <img src=x onerror=alert(1)>
    - SQL Injection: ' OR '1'='1, '; DROP TABLE users--, 1' UNION SELECT NULL--
    - Path traversal: ../../../etc/passwd, ....//....//....//
    - Command injection: ; ls, | whoami, && cat /etc/passwd
    - LDAP injection, XML injection, XXE attacks
    - Template injection: {{7*7}}, ${7*7}, <%= 7*7 %>
    - Server-side request forgery (SSRF)
    - Open redirect vulnerabilities
    - CSRF token validation: missing, invalid, expired, reused
    - Authentication bypass: empty password, null password, admin/admin
    - Session fixation, session hijacking
    - Brute force protection: multiple failed logins
    - Password requirements: min length, complexity, common passwords
    - API keys: exposed in HTML, in URLs, in console logs
    - HTTPS: mixed content, certificate validation
    - Security headers: CSP, X-Frame-Options, HSTS, X-Content-Type-Options
    - Cookie flags: HttpOnly, Secure, SameSite
    - CORS misconfiguration
    - Clickjacking protection
    - Information disclosure: error messages, stack traces, version info
    - File upload restrictions: .exe, .php, .jsp, .svg with scripts
    - Rate limiting: rapid requests, DoS attempts
    - Access control: horizontal privilege escalation, vertical privilege escalation
    - JWT validation: signature verification, expiration, algorithm confusion
    
    ACCESSIBILITY TESTS (WCAG 2.1 Level AAA):
    - Keyboard ONLY navigation: Tab, Shift+Tab, Enter, Space, Arrow keys, Escape
    - Screen reader: NVDA, JAWS, VoiceOver, TalkBack
    - ARIA: labels, roles, states, live regions, hidden, describedby, labelledby
    - Focus indicators: visible, high contrast, not hidden
    - Focus trap: modals, dialogs, dropdowns
    - Skip links: to main content, to navigation
    - Heading hierarchy: H1 unique, H2-H6 properly nested
    - Landmark regions: header, nav, main, aside, footer
    - Images: alt text, decorative images with empty alt
    - Form labels: associated with inputs, error messages, required indicators
    - Color contrast: text 4.5:1, large text 3:1, UI components 3:1
    - Color not the only indicator: error states, success states
    - Text resize: 200% without loss of functionality
    - Responsive text: small screens, large screens
    - Link text: descriptive, not "click here" or "read more"
    - Button vs link: proper semantic usage
    - Tables: header cells, captions, summaries
    - Lists: proper ul/ol/dl usage
    - Language attribute: lang="en", lang changes
    - Page title: unique, descriptive
    - Touch targets: minimum 44x44px
    - Motion: respects prefers-reduced-motion
    - Flashing content: no seizure triggers
    - Audio/video: captions, transcripts, audio descriptions
    - Forms: autocomplete attributes, error prevention, confirmation
    
    PERFORMANCE TESTS (Stress test everything):
    - Page load time: <1s, <2s, >5s concerning
    - First Contentful Paint (FCP)
    - Largest Contentful Paint (LCP)
    - Time to Interactive (TTI)
    - Total Blocking Time (TBT)
    - Cumulative Layout Shift (CLS)
    - Asset sizes: images, CSS, JavaScript, fonts
    - Compression: gzip, brotli
    - Caching headers: Cache-Control, ETag, Last-Modified
    - CDN usage for static assets
    - Bundle analysis: unused code, duplicate dependencies
    - Code splitting: route-based, component-based
    - Tree shaking effectiveness
    - Lazy loading: images, components, routes
    - Preloading critical resources
    - Prefetching next pages
    - Service worker: caching strategy, offline support
    - Memory usage: heap size, garbage collection
    - Memory leaks: detached DOM nodes, event listeners
    - CPU usage: heavy computations, infinite loops
    - Network waterfall: parallel vs serial requests
    - API response times: average, p95, p99
    - Database query performance: N+1 queries, missing indexes
    - Third-party scripts: impact on performance
    - Large dataset handling: 100 items, 1000 items, 10000 items
    - Pagination vs infinite scroll performance
    - Real User Monitoring (RUM) data
    - Lighthouse score: Performance, Accessibility, Best Practices, SEO
    
    USABILITY TESTS:
    - User interface intuitiveness
    - Error message clarity
    - Loading indicators
    - Feedback mechanisms
    - Consistency in design
    - Help documentation
    
    UI/VISUAL TESTS:
    - Layout consistency
    - Responsive breakpoints
    - Image quality and optimization
    - Font rendering
    - Color schemes
    - Spacing and alignment
    - Animation smoothness
    
    COMPATIBILITY TESTS (Test on everything):
    - Browsers: Chrome (latest, -1, -2), Firefox (latest, ESR), Safari (latest, iOS), Edge, Opera, Samsung Internet, UC Browser
    - Browser versions: latest stable, one version back, two versions back, beta, developer
    - Devices: Desktop (Windows, Mac, Linux), Tablet (iPad, Android), Mobile (iPhone, Android)
    - Screen sizes: 320px (iPhone SE), 375px (iPhone), 768px (iPad), 1024px, 1366px, 1920px, 2560px, 4K
    - Orientations: portrait, landscape, rotation during use
    - Pixel densities: 1x, 2x, 3x (Retina)
    - Operating systems: Windows 11, Windows 10, macOS Ventura, macOS Monterey, Ubuntu, iOS 17, iOS 16, Android 14, Android 13
    - Color schemes: light mode, dark mode, high contrast mode, auto-switching
    - Browser settings: JavaScript disabled, cookies disabled, ad blockers, privacy extensions
    - Input methods: mouse, keyboard, touch, stylus, gamepad, voice
    - Assistive tech: screen readers, screen magnifiers, speech recognition, switch controls
    - Network conditions: WiFi, 4G, 3G, 2G, offline
    - Battery saver mode impact
    - Reduced data mode
    - Print preview in different browsers
    - PDF generation from different sources
    - Email client rendering (if applicable)
    - Embedded iframe behavior
    
    DATA TESTS (Break everything with data):
    - Input validation: type checking, range checking, format validation
    - Boundary values: min-1, min, min+1, max-1, max, max+1
    - Data types: null, undefined, NaN, Infinity, -Infinity, true, false, 0, "", [], {}
    - Special characters: quotes, apostrophes, backslashes, unicode, emojis, RTL text
    - Very long strings: 1000 chars, 10000 chars, 1MB of text
    - Very large numbers: Number.MAX_VALUE, beyond limits
    - Negative numbers in unexpected places
    - Decimal precision: 0.1 + 0.2, floating point errors
    - Currency: different symbols, different decimal separators
    - Dates: Unix epoch, far future, daylight saving time transitions
    - Timezones: UTC, local time, different timezones, timezone changes
    - Arrays: empty, single item, many items, nested arrays, circular references
    - Objects: empty, missing keys, extra keys, nested objects, circular references
    - JSON: malformed, extremely nested, very large
    - XML: malformed, XXE attacks, billion laughs
    - CSV: missing columns, extra columns, quoted fields, embedded newlines
    - File formats: valid, corrupted, wrong extension, empty files
    - Data persistence: localStorage, sessionStorage, IndexedDB, cookies
    - Data across page refresh, browser restart, different tabs
    - Concurrent edits: two users editing same data
    - Race conditions: rapid successive operations
    - Database constraints: unique, foreign key, check constraints
    - Transactions: rollback, commit, isolation levels
    - SQL injection in stored data
    - Backup and recovery: restore from backup, point-in-time recovery
    - Data migration: version upgrades, rollbacks
    - Data export: CSV, JSON, Excel, PDF formats
    - Data import: validation, duplicate handling, error recovery
    - Internationalization: different languages, character sets, number formats, date formats
    - Localization: currency, address formats, postal codes, phone numbers
    
    BIZARRE AND RANDOM TESTS (Think outside the box):
    - Rapid clicking/tapping same button 100 times
    - Opening 50 tabs of the same page simultaneously
    - Holding down Enter key for 10 seconds on a form
    - Entering "Robert'); DROP TABLE Students;--" in name field
    - Using browser developer tools to modify DOM during operation
    - Changing system time during session
    - Using browser translate feature
    - Entering emoji in every input field 🎉🔥💀
    - Testing with adblockers and privacy extensions
    - Using browser auto-fill with incorrect data
    - Submitting form while network disconnects mid-request
    - Using "Inspect Element" to bypass disabled buttons
    - Pressing Ctrl+W (close window) during critical operation
    - Using browser password managers
    - Testing with maximum browser zoom (500%+)
    - Leaving page idle for hours and returning
    - Changing browser language during use
    - Using browser reader mode if available
    - Taking screenshots during sensitive operations
    - Using browser picture-in-picture mode
    - Testing with strict CSP policies
    - Using VPN or proxy with geolocation changes
    - Testing with system sounds muted
    - Using browser extensions that modify page content
    - Testing with battery saver mode enabled
    - Rapidly switching between apps/windows
    - Using split screen or multiple monitors
    - Testing during system updates
    - Using remote desktop or screen sharing
    - Testing with virtualized environments
    - Testing with containers and sandboxing
    
    **CRITICAL**: Generate AT LEAST 50-100 detailed test scenarios. Do NOT summarize. Each test must be explicit, specific, and actionable.
    
    **REQUIREMENT**: You MUST find and report positive aspects too. Even files with issues have things done correctly.
    
    For EACH test in detailedTests array, provide:
    1. category: The test category name
    2. testName: Specific, descriptive test name
    3. status: "pass" (working perfectly), "partial" (works but has issues), or "fail" (broken/not working)
    4. description: What was tested (be specific)
    5. actions: Exact step-by-step actions performed
    6. details: Expected vs actual results and any recommendations
    
    **YOUR TASK**: Create the most exhaustive, detailed, comprehensive QA test report possible with 50-100+ test scenarios.

CRITICAL ISSUES (Must Fix):
- Security vulnerabilities (SQL injection, XSS, authentication bypass, exposed secrets)
- Logic errors that cause crashes or data corruption
- Broken functionality or missing required elements

HIGH PRIORITY ISSUES (Should Fix):
- Performance bottlenecks
- Poor error handling
- Accessibility violations
- Missing validation

WARNINGS (Good to Fix):
- Code quality concerns
- Maintainability issues
- Best practice violations

PASSED CHECKS (What's Working Well) - **MANDATORY - FIND AT LEAST 3-5**:
Look for ANY of these positive aspects:
- ✅ Basic HTML structure is valid
- ✅ Forms have labels and inputs
- ✅ CSS styling is applied
- ✅ JavaScript functions exist
- ✅ Responsive design elements present
- ✅ Meta tags included
- ✅ Character encoding specified
- ✅ Viewport configuration correct
- ✅ Script loading implemented
- ✅ Event handlers attached
- ✅ UI elements are interactive
- ✅ Layout structure is logical
- ✅ Code is organized into sections
- ✅ File has documentation/comments
- ✅ Functions have clear names
- ✅ Variables are properly declared

**EXAMPLES of passed checks to report**:
- "HTML document structure follows W3C standards"
- "Form inputs are properly labeled for accessibility"
- "Responsive meta viewport tag is correctly configured"
- "CSS classes provide clear visual hierarchy"
- "JavaScript event handlers are properly attached to DOM elements"
- "UTF-8 character encoding ensures international character support"

For each finding, provide:
- Type (security/logic/performance/quality/accessibility/functionality)
- Description (specific, actionable)
- Location (file and line)
- Recommendation (fix for issues, or encouragement for passed checks)
- Impact (for issues) or Benefit (for passed checks)

**VALIDATION CHECK**: Before submitting your report, verify you have AT LEAST 3 passed checks. If not, look harder at the basics.`;

            controller.enqueue(encoder.encode(sendProgress(60, 'AI is analyzing your code...')));

            const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
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
            const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
            
            controller.enqueue(encoder.encode(sendProgress(90, 'Finalizing report...')));
            
            let report;
            if (toolCall) {
              const parsed = JSON.parse(toolCall.function.arguments);
              if (parsed.summary) {
                report = parsed;
              } else {
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
                  detailedTests: [],
                  metadata: {
                    source: filesToAnalyze[0]?.name || filesToAnalyze[0]?.path || url || 'Unknown',
                    analyzedFiles: filesToAnalyze.length,
                    totalLines: 0
                  }
                };
              }
            } else {
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

            controller.enqueue(encoder.encode(sendProgress(100, 'Complete!')));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(report)}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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

    const systemPrompt = `You are an expert QA automation engineer. Analyze the provided files and generate the MOST COMPREHENSIVE QA test report possible.
    
    Test EVERYTHING including but not limited to:
    
    FUNCTIONALITY TESTS:
    - All interactive elements (buttons, links, forms, inputs)
    - Navigation flows and routing
    - Data validation and error handling
    - API calls and responses
    - State management
    - User workflows and user journeys
    - Edge cases and boundary conditions
    - Cross-browser compatibility (Chrome, Firefox, Safari, Edge)
    - Mobile responsiveness and touch interactions
    - Print functionality
    - Search functionality
    - Filters and sorting
    - Pagination
    - File uploads/downloads
    - Drag and drop features
    
    SECURITY TESTS:
    - XSS vulnerabilities
    - SQL injection risks
    - CSRF protection
    - Authentication mechanisms
    - Authorization and access control
    - Session management
    - Input sanitization
    - Secure data transmission (HTTPS)
    - Password strength requirements
    - API security
    - Sensitive data exposure
    - Security headers
    - Cookie security
    - Rate limiting
    
    ACCESSIBILITY TESTS (WCAG 2.1):
    - Keyboard navigation (tab order, focus indicators)
    - Screen reader compatibility
    - ARIA labels and roles
    - Color contrast ratios
    - Text alternatives for images
    - Form labels and error messages
    - Focus management
    - Skip navigation links
    - Semantic HTML structure
    - Resizable text
    - Alternative input methods
    
    PERFORMANCE TESTS:
    - Page load times
    - Asset optimization
    - Caching strategies
    - Bundle size analysis
    - Memory leaks
    - Network requests optimization
    - Lazy loading implementation
    - Database query optimization
    
    USABILITY TESTS:
    - User interface intuitiveness
    - Error message clarity
    - Loading indicators
    - Feedback mechanisms
    - Consistency in design
    - Help documentation
    
    UI/VISUAL TESTS:
    - Layout consistency
    - Responsive breakpoints
    - Image quality and optimization
    - Font rendering
    - Color schemes
    - Spacing and alignment
    - Animation smoothness
    
    COMPATIBILITY TESTS:
    - Browser compatibility (Chrome, Firefox, Safari, Edge, Opera)
    - Device compatibility (Desktop, Tablet, Mobile)
    - Operating system compatibility
    - Screen resolution variations
    - Dark mode / Light mode
    
    DATA TESTS:
    - Input validation
    - Data persistence
    - Data integrity
    - Database constraints
    - Backup and recovery
    
    **CRITICAL REQUIREMENT**: You MUST find and report positive aspects. Even files with issues have things done correctly.
    
    For each test, provide:
    1. Specific test name
    2. Status: "pass" (working perfectly), "partial" (works but has issues), or "fail" (broken/not working)
    3. Detailed description of what was tested
    4. Exact actions performed to test
    5. Expected vs actual results
    6. Any recommendations for improvement
    
    **YOUR TASK**: Create a balanced comprehensive QA test report identifying BOTH issues AND good practices.

CRITICAL ISSUES (Must Fix):
- Security vulnerabilities (SQL injection, XSS, authentication bypass, exposed secrets)
- Logic errors that cause crashes or data corruption
- Broken functionality or missing required elements

HIGH PRIORITY ISSUES (Should Fix):
- Performance bottlenecks
- Poor error handling
- Accessibility violations
- Missing validation

WARNINGS (Good to Fix):
- Code quality concerns
- Maintainability issues
- Best practice violations

PASSED CHECKS (What's Working Well) - **MANDATORY - FIND AT LEAST 3-5**:
Look for ANY of these positive aspects:
- ✅ Basic HTML structure is valid
- ✅ Forms have labels and inputs
- ✅ CSS styling is applied
- ✅ JavaScript functions exist
- ✅ Responsive design elements present
- ✅ Meta tags included
- ✅ Character encoding specified
- ✅ Viewport configuration correct
- ✅ Script loading implemented
- ✅ Event handlers attached
- ✅ UI elements are interactive
- ✅ Layout structure is logical
- ✅ Code is organized into sections
- ✅ File has documentation/comments
- ✅ Functions have clear names
- ✅ Variables are properly declared

**EXAMPLES of passed checks to report**:
- "HTML document structure follows W3C standards"
- "Form inputs are properly labeled for accessibility"
- "Responsive meta viewport tag is correctly configured"
- "CSS classes provide clear visual hierarchy"
- "JavaScript event handlers are properly attached to DOM elements"
- "UTF-8 character encoding ensures international character support"

For each finding, provide:
- Type (security/logic/performance/quality/accessibility/functionality)
- Description (specific, actionable)
- Location (file and line)
- Recommendation (fix for issues, or encouragement for passed checks)
- Impact (for issues) or Benefit (for passed checks)

**VALIDATION CHECK**: Before submitting your report, verify you have AT LEAST 3 passed checks. If not, look harder at the basics.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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
