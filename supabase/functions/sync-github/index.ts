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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { bugId, action } = await req.json();

    // Get GitHub integration config
    const { data: integrationData, error: integrationError } = await supabaseClient
      .from('integrations')
      .select('*')
      .eq('type', 'github')
      .eq('enabled', true)
      .single();

    if (integrationError || !integrationData) {
      throw new Error('GitHub integration not configured');
    }

    const { token, owner, repo } = integrationData.config;

    // Get bug details
    const { data: bug, error: bugError } = await supabaseClient
      .from('bugs')
      .select('*')
      .eq('id', bugId)
      .single();

    if (bugError || !bug) {
      throw new Error('Bug not found');
    }

    if (action === 'create') {
      // Create GitHub issue
      const issueBody = `
${bug.description}

**Severity:** ${bug.severity}
**Environment:** ${bug.environment || 'Not specified'}

${bug.steps_to_reproduce ? `**Steps to Reproduce:**\n${bug.steps_to_reproduce}` : ''}
`;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          title: bug.title,
          body: issueBody,
          labels: ['bug', bug.severity]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
      }

      const createdIssue = await response.json();

      // Update bug with GitHub issue number
      await supabaseClient
        .from('bugs')
        .update({ github_issue_number: createdIssue.number })
        .eq('id', bugId);

      return new Response(
        JSON.stringify({ success: true, issueNumber: createdIssue.number, url: createdIssue.html_url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'update') {
      // Update existing GitHub issue
      if (!bug.github_issue_number) {
        throw new Error('Bug not linked to GitHub issue');
      }

      const issueBody = `
${bug.description}

**Severity:** ${bug.severity}
**Status:** ${bug.status}
**Environment:** ${bug.environment || 'Not specified'}

${bug.steps_to_reproduce ? `**Steps to Reproduce:**\n${bug.steps_to_reproduce}` : ''}
`;

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${bug.github_issue_number}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          title: bug.title,
          body: issueBody,
          state: bug.status === 'closed' ? 'closed' : 'open'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error syncing with GitHub:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
