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
