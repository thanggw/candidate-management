import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type CandidateStatus = "applied" | "screening" | "interview" | "offer" | "rejected" | "hired";

type Candidate = {
  id: string;
  full_name: string;
  applied_position: string;
  status: CandidateStatus;
  created_at: string;
};

const statuses: CandidateStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "hired",
];

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "POST") {
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

  const { data, error } = await supabase
    .from("candidates")
    .select("id, full_name, applied_position, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const candidates = (data ?? []) as Candidate[];
  const totalCandidates = candidates.length;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const statusRatios = statuses.map((status) => {
    const count = candidates.filter((candidate) => candidate.status === status).length;

    return {
      status,
      count,
      ratio: totalCandidates === 0 ? 0 : count / totalCandidates,
    };
  });

  const positionCounts = candidates.reduce<Record<string, number>>((counts, candidate) => {
    const position = candidate.applied_position.trim();

    if (!position) {
      return counts;
    }

    counts[position] = (counts[position] ?? 0) + 1;
    return counts;
  }, {});

  const topPositions = Object.entries(positionCounts)
    .map(([position, count]) => ({ position, count }))
    .sort((first, second) => second.count - first.count || first.position.localeCompare(second.position))
    .slice(0, 3);

  const newestCandidatesWithinSevenDays = candidates.filter(
    (candidate) => new Date(candidate.created_at) >= sevenDaysAgo,
  );
  const newestCandidates = newestCandidatesWithinSevenDays.slice(0, 5);

  return jsonResponse(
    {
      totalCandidates,
      statusRatios,
      topPositions,
      newestCandidates,
      newestCandidatesCount: newestCandidatesWithinSevenDays.length,
    },
    200,
  );
});
