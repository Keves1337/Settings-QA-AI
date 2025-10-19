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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { bugId, screenshotBase64, fileName } = await req.json();

    if (!screenshotBase64 || !bugId) {
      throw new Error('Missing required fields: bugId and screenshotBase64');
    }

    // Convert base64 to binary
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Upload to storage
    const timestamp = Date.now();
    const filePath = `bugs/${bugId}/${fileName || `screenshot-${timestamp}.png`}`;
    
    const { error: uploadError } = await supabaseClient.storage
      .from('test-reports')
      .upload(filePath, binaryData, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload screenshot: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('test-reports')
      .getPublicUrl(filePath);

    // Update bug record with screenshot URL
    const { data: bug, error: bugError } = await supabaseClient
      .from('bugs')
      .select('screenshots')
      .eq('id', bugId)
      .single();

    if (bugError && bugError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch bug: ${bugError.message}`);
    }

    const existingScreenshots = bug?.screenshots || [];
    const { error: updateError } = await supabaseClient
      .from('bugs')
      .update({ 
        screenshots: [...existingScreenshots, urlData.publicUrl]
      })
      .eq('id', bugId);

    if (updateError) {
      throw new Error(`Failed to update bug: ${updateError.message}`);
    }

    console.log('Screenshot uploaded successfully:', urlData.publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        screenshotUrl: urlData.publicUrl,
        filePath 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
