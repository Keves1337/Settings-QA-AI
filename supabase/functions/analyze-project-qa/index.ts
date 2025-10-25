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

  try {
    const { files, projectFiles, deepAnalysis = true } = await req.json();
    const filesToAnalyze = files || projectFiles;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!filesToAnalyze || !Array.isArray(filesToAnalyze)) {
      throw new Error('No files provided for analysis');
    }

    // Prepare project context for AI analysis
    const fileContext = filesToAnalyze.map((file: any) => 
      `File: ${file.name || file.path}\n${file.content}`
    ).join('\n\n');

    const systemPrompt = `You are an expert QA engineer analyzing code for bugs, security issues, and quality problems.
Analyze the provided code comprehensively and identify:
1. Security vulnerabilities (SQL injection, XSS, authentication issues)
2. Logic errors and potential runtime bugs
3. Performance issues
4. Code quality and maintainability concerns
5. Missing error handling
6. Accessibility issues
7. Edge cases not handled

For each issue found, provide:
- Type (security/logic/performance/quality/accessibility)
- Severity (critical/high/medium/low)
- Description (clear explanation)
- Location (file:line)
- Recommendation (how to fix)
- Impact (what could go wrong)`;

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
            name: 'report_analysis',
            description: 'Report comprehensive code analysis results',
            parameters: {
              type: 'object',
              properties: {
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['security', 'logic', 'performance', 'quality', 'accessibility'] },
                      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                      description: { type: 'string' },
                      location: { type: 'string' },
                      recommendation: { type: 'string' },
                      impact: { type: 'string' }
                    },
                    required: ['type', 'severity', 'description', 'location', 'recommendation', 'impact']
                  }
                },
                suggestions: { type: 'array', items: { type: 'string' } },
                testCoverage: { type: 'number' },
                complexity: { type: 'string', enum: ['low', 'medium', 'high', 'very-high'] }
              },
              required: ['issues', 'suggestions', 'complexity']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'report_analysis' } }
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
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const analysis = toolCall ? JSON.parse(toolCall.function.arguments) : {
      issues: [],
      suggestions: ['Enable AI analysis for detailed insights'],
      complexity: 'unknown'
    };

    console.log('Analysis completed:', analysis);

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing project:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
