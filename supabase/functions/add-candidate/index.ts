import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedStatuses = new Set([
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "hired",
]);

type CandidatePayload = {
  full_name?: unknown;
  applied_position?: unknown;
  status?: unknown;
  resume_url?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Supabase environment is not configured" }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  let payload: CandidatePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  let fullName: string;
  let appliedPosition: string;

  try {
    fullName = getRequiredString(payload.full_name, "full_name");
    appliedPosition = getRequiredString(payload.applied_position, "applied_position");
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid payload" }, 400);
  }

  const status = typeof payload.status === "string" && payload.status.trim().length > 0
    ? payload.status.trim()
    : "applied";

  if (!allowedStatuses.has(status)) {
    return jsonResponse({ error: "Invalid candidate status" }, 400);
  }

  const resumeUrl = typeof payload.resume_url === "string" && payload.resume_url.trim().length > 0
    ? payload.resume_url.trim()
    : null;

  if (resumeUrl && !resumeUrl.startsWith(`${user.id}/`)) {
    return jsonResponse({ error: "resume_url must point to the authenticated user's storage folder" }, 400);
  }

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      user_id: user.id,
      full_name: fullName,
      applied_position: appliedPosition,
      status,
      resume_url: resumeUrl,
    })
    .select("id, user_id, full_name, applied_position, status, resume_url, created_at")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ candidate: data }, 201);
});
