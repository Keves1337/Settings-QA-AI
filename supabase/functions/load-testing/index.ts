import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadTestRequest {
  url: string;
  totalRequests: number;
  concurrentRequests: number;
}

interface RequestResult {
  success: boolean;
  responseTime: number;
  error?: string;
}

async function performRequest(url: string): Promise<RequestResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LoadTester/1.0',
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    return {
      success: response.ok,
      responseTime,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runLoadTest(url: string, totalRequests: number, concurrentRequests: number) {
  const results: RequestResult[] = [];
  const errors: string[] = [];
  const testStartTime = Date.now();
  
  // Run requests in batches based on concurrency limit
  for (let i = 0; i < totalRequests; i += concurrentRequests) {
    const batchSize = Math.min(concurrentRequests, totalRequests - i);
    const batch = Array(batchSize).fill(null).map(() => performRequest(url));
    
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    
    // Collect errors
    batchResults.forEach((result, index) => {
      if (!result.success && result.error) {
        errors.push(`Request ${i + index + 1}: ${result.error}`);
      }
    });
  }
  
  const totalDuration = (Date.now() - testStartTime) / 1000; // in seconds
  
  // Calculate statistics
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.length - successfulRequests;
  const responseTimes = results.map(r => r.responseTime);
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const minResponseTime = Math.min(...responseTimes);
  const maxResponseTime = Math.max(...responseTimes);
  const requestsPerSecond = totalRequests / totalDuration;
  
  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageResponseTime,
    minResponseTime,
    maxResponseTime,
    requestsPerSecond,
    errors: errors.slice(0, 20), // Limit to first 20 errors
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, totalRequests, concurrentRequests }: LoadTestRequest = await req.json();
    
    // Validate input
    if (!url) {
      throw new Error('URL is required');
    }
    
    // Limit requests to prevent timeout and abuse
    const safeTotal = Math.min(totalRequests || 100, 500);
    const safeConcurrent = Math.min(concurrentRequests || 10, 25);
    
    if (safeTotal < 1) {
      throw new Error('Total requests must be at least 1');
    }
    
    if (safeConcurrent < 1) {
      throw new Error('Concurrent requests must be at least 1');
    }
    
    console.log(`Starting load test: ${safeTotal} requests to ${url} with ${safeConcurrent} concurrent`);
    
    const results = await runLoadTest(url, safeTotal, safeConcurrent);
    
    console.log(`Load test completed: ${results.successfulRequests}/${results.totalRequests} successful`);
    
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Load test error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
