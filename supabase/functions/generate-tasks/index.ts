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
    const { phase, existingTasks } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an AI assistant specialized in software development lifecycle (SDLC) management. Generate practical, actionable tasks for software development projects.`;
    
    const userPrompt = phase === 'all' 
      ? `Generate 5 diverse tasks across different SDLC phases (Planning, Requirements, Design, Development, Testing, Deployment, Maintenance). Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`
      : `Generate 3-5 specific tasks for the ${phase} phase of the SDLC. Consider existing tasks to avoid duplicates: ${JSON.stringify(existingTasks)}`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "generate_tasks",
            description: "Generate actionable SDLC tasks with proper categorization",
            parameters: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Clear, actionable task title" },
                      description: { type: "string", description: "Detailed task description" },
                      priority: { type: "string", enum: ["low", "medium", "high"] },
                      phase: { 
                        type: "string", 
                        enum: ["Planning", "Requirements", "Design", "Development", "Testing", "Deployment", "Maintenance"] 
                      }
                    },
                    required: ["title", "description", "priority", "phase"],
                    additionalProperties: false
                  }
                }
              },
              required: ["tasks"],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "generate_tasks" } }
    };

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error('No tasks generated');
    }

    const result = JSON.parse(toolCall.function.arguments);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating tasks:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
