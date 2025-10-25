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
    // Verify authentication
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

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const requestBody = await req.json();
    
    // Input validation
    if (!requestBody.bugId || typeof requestBody.bugId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid bugId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!requestBody.action || !['create', 'update'].includes(requestBody.action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Must be create or update' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { bugId, action } = requestBody;

    // Get Jira integration config
    const { data: integrationData, error: integrationError } = await supabaseClient
      .from('integrations')
      .select('*')
      .eq('type', 'jira')
      .eq('enabled', true)
      .single();

    if (integrationError || !integrationData) {
      throw new Error('Jira integration not configured');
    }

    const { jiraUrl, email, apiToken, projectKey } = integrationData.config;

    // Get bug details
    const { data: bug, error: bugError } = await supabaseClient
      .from('bugs')
      .select('*')
      .eq('id', bugId)
      .single();

    if (bugError || !bug) {
      throw new Error('Bug not found');
    }

    const auth = btoa(`${email}:${apiToken}`);

    if (action === 'create') {
      // Create Jira issue
      const jiraIssue = {
        fields: {
          project: { key: projectKey },
          summary: bug.title,
          description: bug.description,
          issuetype: { name: 'Bug' },
          priority: { name: bug.severity.charAt(0).toUpperCase() + bug.severity.slice(1) }
        }
      };

      const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jiraIssue),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira API error: ${response.status} - ${errorText}`);
      }

      const createdIssue = await response.json();

      // Update bug with Jira issue key
      await supabaseClient
        .from('bugs')
        .update({ jira_issue_key: createdIssue.key })
        .eq('id', bugId);

      return new Response(
        JSON.stringify({ success: true, issueKey: createdIssue.key }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'update') {
      // Update existing Jira issue
      if (!bug.jira_issue_key) {
        throw new Error('Bug not linked to Jira issue');
      }

      const updateData = {
        fields: {
          summary: bug.title,
          description: bug.description
        }
      };

      const response = await fetch(`${jiraUrl}/rest/api/3/issue/${bug.jira_issue_key}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira API error: ${response.status} - ${errorText}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error syncing with Jira:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
