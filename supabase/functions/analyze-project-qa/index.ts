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

    const { files, projectFiles, deepAnalysis = true } = await req.json();
    const filesToAnalyze = files || projectFiles;
    filesCount = filesToAnalyze.length;
    
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

    const systemPrompt = `You are an expert QA testing engineer analyzing files for quality, bugs, security issues, and best practices.

**CRITICAL REQUIREMENT**: You MUST find and report positive aspects in every analysis. Even files with issues have things done correctly. A QA report that only lists problems is incomplete and demotivating.

**YOUR TASK**: Create a balanced QA test report identifying BOTH issues AND good practices.

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
                }
              },
              required: ['summary', 'criticalIssues', 'highPriorityIssues', 'warnings', 'passedChecks']
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
          overallStatus: 'warning'
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
        passedChecks: []
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
        overallStatus: 'warning'
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
      passedChecks: []
    };
    return new Response(
      JSON.stringify(fallbackReport),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
