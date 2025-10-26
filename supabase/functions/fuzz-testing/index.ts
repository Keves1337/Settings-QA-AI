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

    const { codeFiles, testConfig } = await req.json();
    
    // Input validation
    if (!codeFiles || !Array.isArray(codeFiles)) {
      return new Response(JSON.stringify({ error: 'Invalid codeFiles array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (codeFiles.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one code file required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (codeFiles.length > 20) {
      return new Response(JSON.stringify({ error: 'Maximum 20 code files allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate each code file
    for (const file of codeFiles) {
      if (!file.name || typeof file.name !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid file name' }), {
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

      if (file.content.length > 500000) {
        return new Response(JSON.stringify({ error: 'File too large. Maximum 500KB per file' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (!testConfig || typeof testConfig !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid testConfig' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const iterations = testConfig.iterations || 100;
    if (typeof iterations !== 'number' || iterations < 1 || iterations > 500) {
      return new Response(JSON.stringify({ error: 'Iterations must be between 1 and 500' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const fileContext = codeFiles.map((file: any) => 
      `File: ${file.path}\n${file.content}`
    ).join('\n\n');

    const systemPrompt = `You are an expert fuzzing and property-based testing engineer. Analyze the code and generate extreme edge cases and randomized tests to find bugs.

Your goal is to break the code by generating:
1. Random boundary values (max/min integers, empty strings, null, undefined)
2. Invalid type combinations
3. SQL injection attempts
4. XSS attack vectors
5. Buffer overflow patterns
6. Race conditions
7. Memory leaks
8. Unexpected Unicode characters
9. Malformed JSON/data structures
10. Concurrent access patterns

For each fuzz test, provide:
- testType: The category of fuzzing (boundary/injection/malformed/concurrent/memory)
- input: The random/malicious input to test
- expectedBehavior: What should happen (crash/error/safe handling)
- severity: How critical if it fails (critical/high/medium/low)
- description: What vulnerability this tests for`;

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
          { 
            role: 'user', 
            content: `Generate ${iterations} fuzzing test cases for this code. Focus on finding bugs through edge cases:\n\n${fileContext}` 
          }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_fuzz_tests',
            description: 'Generate randomized fuzzing test cases',
            parameters: {
              type: 'object',
              properties: {
                fuzzTests: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      testType: { 
                        type: 'string',
                        enum: ['boundary', 'injection', 'malformed', 'concurrent', 'memory', 'type-confusion', 'overflow']
                      },
                      targetFunction: { type: 'string' },
                      input: { type: 'string' },
                      expectedBehavior: { type: 'string' },
                      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                      description: { type: 'string' },
                      potentialImpact: { type: 'string' }
                    },
                    required: ['testType', 'targetFunction', 'input', 'expectedBehavior', 'severity', 'description']
                  }
                },
                coverageAreas: { type: 'array', items: { type: 'string' } },
                estimatedBugsFound: { type: 'number' }
              },
              required: ['fuzzTests', 'coverageAreas']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_fuzz_tests' } }
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
    const fuzzResults = toolCall ? JSON.parse(toolCall.function.arguments) : {
      fuzzTests: [],
      coverageAreas: [],
      estimatedBugsFound: 0
    };

    console.log('Fuzz testing completed:', fuzzResults.fuzzTests.length, 'tests generated');

    return new Response(
      JSON.stringify(fuzzResults),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fuzz testing:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
