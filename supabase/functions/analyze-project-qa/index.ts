import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { files } = await req.json();
    
    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare file analysis context
    const fileContext = files.map((file: any) => 
      `File: ${file.name}\nType: ${file.type}\n\n${file.content.substring(0, 2000)}`
    ).join('\n\n---\n\n');

    const systemPrompt = `You are an expert QA automation engineer. Analyze the provided code files and generate comprehensive, automated test cases.

For each test case, provide:
1. A clear, descriptive title
2. Detailed description of what's being tested
3. Step-by-step test instructions
4. Expected results
5. Priority (high/medium/low)
6. SDLC phase (Requirements/Design/Development/Testing/Deployment/Maintenance)

Focus on:
- Unit tests for functions and components
- Integration tests for API endpoints
- UI/UX tests for user interactions
- Edge cases and error handling
- Security and performance considerations

Generate 5-10 high-quality test cases based on the code structure.`;

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
          { role: 'user', content: `Analyze these code files and generate automated test cases:\n\n${fileContext}` }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_test_cases',
            description: 'Generate automated test cases from code analysis',
            parameters: {
              type: 'object',
              properties: {
                testCases: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      steps: {
                        type: 'array',
                        items: { type: 'string' }
                      },
                      expectedResult: { type: 'string' },
                      priority: { 
                        type: 'string',
                        enum: ['high', 'medium', 'low']
                      },
                      phase: { 
                        type: 'string',
                        enum: ['Requirements', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance']
                      }
                    },
                    required: ['title', 'description', 'steps', 'expectedResult', 'priority', 'phase']
                  }
                }
              },
              required: ['testCases']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_test_cases' } }
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
    
    let testCases = [];
    if (data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const args = JSON.parse(data.choices[0].message.tool_calls[0].function.arguments);
      testCases = args.testCases || [];
    }

    return new Response(
      JSON.stringify({ testCases }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
