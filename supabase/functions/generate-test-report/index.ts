import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testRunId, testCase, result, duration, timestamp } = await req.json();

    // Generate STR (Standard Test Report) content
    const reportContent = generateSTRReport({
      testRunId,
      testCase,
      result,
      duration,
      timestamp,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload report to storage
    const fileName = `test-report-${testRunId}-${Date.now()}.str`;
    const filePath = `reports/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('test-reports')
      .upload(filePath, reportContent, {
        contentType: 'text/plain',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('test-reports')
      .getPublicUrl(filePath);

    // Update test run with report URL
    const { error: updateError } = await supabase
      .from('test_runs')
      .update({ report_url: urlData.publicUrl })
      .eq('id', testRunId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    // Sync to integrations
    await syncReportToIntegrations(supabase, testRunId, filePath, reportContent);

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportUrl: urlData.publicUrl,
        fileName 
      }),
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

function generateSTRReport(data: any): string {
  const { testRunId, testCase, result, duration, timestamp } = data;
  
  return `═══════════════════════════════════════════════════════════
        STANDARD TEST REPORT (STR)
═══════════════════════════════════════════════════════════

Report ID: ${testRunId}
Generated: ${new Date(timestamp).toISOString()}
Test Execution Duration: ${duration}ms

───────────────────────────────────────────────────────────
TEST CASE INFORMATION
───────────────────────────────────────────────────────────

Title: ${testCase.title}
Description: ${testCase.description}
Priority: ${testCase.priority}
Phase: ${testCase.phase}
Automated: ${testCase.automated ? 'Yes' : 'No'}

───────────────────────────────────────────────────────────
TEST EXECUTION STEPS
───────────────────────────────────────────────────────────

${testCase.steps?.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}

───────────────────────────────────────────────────────────
EXPECTED RESULT
───────────────────────────────────────────────────────────

${testCase.expected_result}

───────────────────────────────────────────────────────────
ACTUAL RESULT
───────────────────────────────────────────────────────────

Status: ${result.status.toUpperCase()}
${result.result}

───────────────────────────────────────────────────────────
TEST METRICS
───────────────────────────────────────────────────────────

Execution Time: ${duration}ms
Pass/Fail: ${result.status === 'passed' ? '✓ PASSED' : '✗ FAILED'}
Timestamp: ${new Date(timestamp).toLocaleString()}

───────────────────────────────────────────────────────────
ENVIRONMENT INFORMATION
───────────────────────────────────────────────────────────

Test Runner: Automated QA System
Platform: Lovable Cloud
Database: Supabase

═══════════════════════════════════════════════════════════
        END OF STANDARD TEST REPORT
═══════════════════════════════════════════════════════════
`;
}

async function syncReportToIntegrations(
  supabase: any,
  testRunId: string,
  filePath: string,
  reportContent: string
) {
  // Get integration settings
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('enabled', true);

  if (!integrations || integrations.length === 0) {
    console.log('No integrations enabled');
    return;
  }

  const jiraIntegration = integrations.find((i: any) => i.type === 'jira');
  const githubIntegration = integrations.find((i: any) => i.type === 'github');

  // Sync to Jira
  if (jiraIntegration && jiraIntegration.config.autoSync) {
    try {
      await syncToJira(jiraIntegration.config, testRunId, reportContent);
      await supabase
        .from('test_runs')
        .update({ synced_to_jira: true })
        .eq('id', testRunId);
    } catch (error) {
      console.error('Jira sync error:', error);
    }
  }

  // Sync to GitHub
  if (githubIntegration && githubIntegration.config.autoSync) {
    try {
      await syncToGitHub(githubIntegration.config, testRunId, filePath, reportContent);
      await supabase
        .from('test_runs')
        .update({ synced_to_github: true })
        .eq('id', testRunId);
    } catch (error) {
      console.error('GitHub sync error:', error);
    }
  }
}

async function syncToJira(config: any, testRunId: string, reportContent: string) {
  const auth = btoa(`${config.jiraEmail}:${config.jiraApiToken}`);
  
  // Create a test execution issue if not exists
  const issueResponse = await fetch(`${config.jiraUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: config.jiraProjectKey },
        summary: `Test Report - ${testRunId}`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: reportContent,
                },
              ],
            },
          ],
        },
        issuetype: { name: 'Task' },
      },
    }),
  });

  const issue = await issueResponse.json();
  console.log('Jira issue created:', issue.key);
  
  return issue;
}

async function syncToGitHub(config: any, testRunId: string, filePath: string, reportContent: string) {
  const response = await fetch(
    `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/test-reports/${testRunId}.str`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add test report ${testRunId}`,
        content: btoa(reportContent),
      }),
    }
  );

  const result = await response.json();
  console.log('GitHub file created:', result.content?.html_url);
  
  return result;
}
