import type { ChangeEvent, FormEvent } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import styles from "./Dashboard.module.scss";

type CandidateStatus = "applied" | "screening" | "interview" | "offer" | "rejected" | "hired";

type Candidate = {
  id: string;
  user_id: string;
  full_name: string;
  applied_position: string;
  status: CandidateStatus;
  resume_url: string | null;
  created_at: string;
};

type CandidateCursor = Pick<Candidate, "created_at" | "id">;

type AddCandidateResponse = {
  candidate?: Candidate;
  error?: string;
};

type AnalyticsResponse = {
  totalCandidates: number;
  statusRatios: Array<{
    status: CandidateStatus;
    count: number;
    ratio: number;
  }>;
  topPositions: Array<{
    position: string;
    count: number;
  }>;
  newestCandidates: Array<Pick<Candidate, "id" | "full_name" | "applied_position" | "created_at">>;
  newestCandidatesCount: number;
  error?: string;
};

const candidateStatuses: CandidateStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "hired",
];

const statusLabels: Record<CandidateStatus, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  hired: "Hired",
};

const pageSize = 8;

function getCandidateTime(candidate: Candidate) {
  return new Date(candidate.created_at).getTime();
}

function getSearchScore(candidate: Candidate, searchTerm: string) {
  const normalizedTerm = searchTerm.trim().toLowerCase();

  if (!normalizedTerm) {
    return 0;
  }

  const name = candidate.full_name.toLowerCase();
  const position = candidate.applied_position.toLowerCase();
  const words = normalizedTerm.split(/\s+/).filter(Boolean);
  let score = 0;

  if (name === normalizedTerm) {
    score += 100;
  }

  if (position === normalizedTerm) {
    score += 80;
  }

  if (name.startsWith(normalizedTerm)) {
    score += 50;
  }

  if (position.startsWith(normalizedTerm)) {
    score += 40;
  }

  if (name.includes(normalizedTerm)) {
    score += 25;
  }

  if (position.includes(normalizedTerm)) {
    score += 20;
  }

  for (const word of words) {
    if (name.includes(word)) {
      score += 8;
    }

    if (position.includes(word)) {
      score += 6;
    }
  }

  return score;
}

function sortCandidates(candidates: Candidate[], searchTerm: string) {
  return [...candidates].sort((first, second) => {
    const firstScore = getSearchScore(first, searchTerm);
    const secondScore = getSearchScore(second, searchTerm);

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    const createdAtDifference = getCandidateTime(second) - getCandidateTime(first);

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return second.id.localeCompare(first.id);
  });
}

function mergeCandidates(
  currentCandidates: Candidate[],
  incomingCandidates: Candidate[],
  searchTerm: string,
) {
  const candidateMap = new Map<string, Candidate>();

  for (const candidate of currentCandidates) {
    candidateMap.set(candidate.id, candidate);
  }

  for (const candidate of incomingCandidates) {
    candidateMap.set(candidate.id, candidate);
  }

  return sortCandidates([...candidateMap.values()], searchTerm);
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function sanitizeSearchTerm(searchTerm: string) {
  return searchTerm.trim().replace(/[,%]/g, " ");
}

function toEndOfDayIso(dateValue: string) {
  const date = new Date(`${dateValue}T23:59:59.999`);
  return date.toISOString();
}

function candidateMatchesFilters(
  candidate: Candidate,
  filters: {
    searchTerm: string;
    status: CandidateStatus | "all";
    dateFrom: string;
    dateTo: string;
  },
) {
  const searchTerm = filters.searchTerm.trim().toLowerCase();
  const candidateTime = getCandidateTime(candidate);

  if (
    searchTerm &&
    !candidate.full_name.toLowerCase().includes(searchTerm) &&
    !candidate.applied_position.toLowerCase().includes(searchTerm)
  ) {
    return false;
  }

  if (filters.status !== "all" && candidate.status !== filters.status) {
    return false;
  }

  if (filters.dateFrom && candidateTime < new Date(`${filters.dateFrom}T00:00:00`).getTime()) {
    return false;
  }

  if (filters.dateTo && candidateTime > new Date(`${filters.dateTo}T23:59:59.999`).getTime()) {
    return false;
  }

  return true;
}

export function Dashboard() {
  const { signOut, user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [appliedPosition, setAppliedPosition] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nextCursor, setNextCursor] = useState<CandidateCursor | null>(null);
  const [hasMoreCandidates, setHasMoreCandidates] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const filters = useMemo(
    () => ({
      searchTerm,
      status: statusFilter,
      dateFrom,
      dateTo,
    }),
    [dateFrom, dateTo, searchTerm, statusFilter],
  );

  const candidateCountLabel = useMemo(() => {
    if (candidates.length === 1) {
      return "1 candidate loaded";
    }

    return `${candidates.length} candidates loaded`;
  }, [candidates.length]);

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);

    const { data, error: analyticsError } =
      await supabase.functions.invoke<AnalyticsResponse>("analytics", {
        method: "GET",
      });

    if (analyticsError) {
      setError(analyticsError.message);
    } else if (data?.error) {
      setError(data.error);
    } else {
      setAnalytics(data ?? null);
    }

    setLoadingAnalytics(false);
  }, []);

  const fetchCandidatePage = useCallback(
    async (options?: { cursor?: CandidateCursor | null; append?: boolean }) => {
      const append = options?.append ?? false;
      const cursor = options?.cursor ?? null;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingCandidates(true);
      }

      setError("");

      let query = supabase
        .from("candidates")
        .select("id, user_id, full_name, applied_position, status, resume_url, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1);

      const cleanedSearchTerm = sanitizeSearchTerm(filters.searchTerm);

      if (cleanedSearchTerm) {
        query = query.or(
          `full_name.ilike.%${cleanedSearchTerm}%,applied_position.ilike.%${cleanedSearchTerm}%`,
        );
      }

      if (filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters.dateFrom) {
        query = query.gte("created_at", new Date(`${filters.dateFrom}T00:00:00`).toISOString());
      }

      if (filters.dateTo) {
        query = query.lte("created_at", toEndOfDayIso(filters.dateTo));
      }

      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        );
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        const pageRows = ((data ?? []) as Candidate[]).slice(0, pageSize);
        const finalRow = pageRows.at(-1) ?? null;

        setCandidates((currentCandidates) =>
          append ? mergeCandidates(currentCandidates, pageRows, filters.searchTerm) : sortCandidates(pageRows, filters.searchTerm),
        );
        setNextCursor(finalRow ? { created_at: finalRow.created_at, id: finalRow.id } : null);
        setHasMoreCandidates((data?.length ?? 0) > pageSize);
      }

      setLoadingCandidates(false);
      setLoadingMore(false);
    },
    [filters],
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchCandidatePage();
  }, [fetchCandidatePage, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchAnalytics();
  }, [fetchAnalytics, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const channel = supabase
      .channel(`candidates:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Candidate>) => {
          setCandidates((currentCandidates) => {
            if (payload.eventType === "DELETE") {
              return currentCandidates.filter((candidate) => candidate.id !== payload.old.id);
            }

            const nextCandidate = payload.new;
            const currentCandidateIds = new Set(currentCandidates.map((candidate) => candidate.id));

            if (
              !candidateMatchesFilters(nextCandidate, filters) &&
              currentCandidateIds.has(nextCandidate.id)
            ) {
              return currentCandidates.filter((candidate) => candidate.id !== nextCandidate.id);
            }

            if (!candidateMatchesFilters(nextCandidate, filters)) {
              return currentCandidates;
            }

            return mergeCandidates(currentCandidates, [nextCandidate], filters.searchTerm);
          });

          fetchAnalytics();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAnalytics, filters, user]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setResumeFile(event.target.files?.[0] ?? null);
  }

  function handleResetFilters() {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  async function handleAddCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!user) {
      return;
    }

    if (!resumeFile) {
      setError("Please attach a PDF resume.");
      return;
    }

    if (resumeFile.type !== "application/pdf") {
      setError("Resume must be a PDF file.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const { data: functionData, error: functionError } =
        await supabase.functions.invoke<AddCandidateResponse>("add-candidate", {
          body: {
            full_name: fullName,
            applied_position: appliedPosition,
            status: "applied",
          },
        });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!functionData?.candidate) {
        throw new Error(functionData?.error ?? "Candidate could not be created");
      }

      const candidate = functionData.candidate;
      const storagePath = `${user.id}/${candidate.id}/${Date.now()}-${sanitizeFileName(
        resumeFile.name,
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(storagePath, resumeFile, {
          contentType: resumeFile.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("resumes").getPublicUrl(storagePath);

      const { error: updateError } = await supabase
        .from("candidates")
        .update({ resume_url: publicUrl })
        .eq("id", candidate.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setFullName("");
      setAppliedPosition("");
      setResumeFile(null);
      form?.reset();
      setSuccessMessage("Candidate added successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Unable to add candidate",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(candidateId: string, nextStatus: CandidateStatus) {
    setUpdatingStatusId(candidateId);
    setError("");
    setSuccessMessage("");

    const { error: updateError } = await supabase
      .from("candidates")
      .update({ status: nextStatus })
      .eq("id", candidateId);

    if (updateError) {
      setError(updateError.message);
    }

    setUpdatingStatusId(null);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Candidate Management</p>
          <h1>Dashboard</h1>
          <p className={styles.userEmail}>{user?.email}</p>
        </div>
        <button className={styles.logoutButton} type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section className={styles.analyticsPanel} aria-labelledby="analytics-title">
        <div className={styles.analyticsHeader}>
          <div>
            <p className={styles.label}>Statistics</p>
            <h2 id="analytics-title">Analytics</h2>
          </div>
          <button type="button" onClick={fetchAnalytics}>
            Refresh
          </button>
        </div>

        {loadingAnalytics ? (
          <p className={styles.mutedText}>Loading analytics...</p>
        ) : analytics ? (
          <div className={styles.analyticsGrid}>
            <article className={styles.metricCard}>
              <span>Total candidates</span>
              <strong>{analytics.totalCandidates}</strong>
            </article>

            <article className={styles.metricCard}>
              <span>Newest in 7 days</span>
              <strong>{analytics.newestCandidatesCount}</strong>
            </article>

            <article className={styles.wideMetricCard}>
              <span>Status ratios</span>
              <div className={styles.ratioList}>
                {analytics.statusRatios.map((statusRatio) => (
                  <p key={statusRatio.status}>
                    <span>{statusLabels[statusRatio.status]}</span>
                    <strong>{Math.round(statusRatio.ratio * 100)}%</strong>
                  </p>
                ))}
              </div>
            </article>

            <article className={styles.wideMetricCard}>
              <span>Top positions</span>
              {analytics.topPositions.length === 0 ? (
                <p className={styles.compactMutedText}>No positions yet.</p>
              ) : (
                <ol className={styles.positionList}>
                  {analytics.topPositions.map((position) => (
                    <li key={position.position}>
                      <span>{position.position}</span>
                      <strong>{position.count}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          </div>
        ) : (
          <p className={styles.mutedText}>Analytics unavailable.</p>
        )}
      </section>

      <section className={styles.contentGrid}>
        <form className={styles.formPanel} onSubmit={handleAddCandidate}>
          <div className={styles.sectionHeader}>
            <p className={styles.label}>New candidate</p>
            <h2>Add application</h2>
          </div>

          <label>
            Full name
            <input
              name="full_name"
              onChange={(event) => setFullName(event.target.value)}
              required
              type="text"
              value={fullName}
            />
          </label>

          <label>
            Applied position
            <input
              name="applied_position"
              onChange={(event) => setAppliedPosition(event.target.value)}
              required
              type="text"
              value={appliedPosition}
            />
          </label>

          <label>
            Resume PDF
            <input
              accept="application/pdf"
              name="resume"
              onChange={handleFileChange}
              required
              type="file"
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}
          {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

          <button disabled={submitting} type="submit">
            {submitting ? "Adding candidate..." : "Add candidate"}
          </button>
        </form>

        <section className={styles.listPanel} aria-labelledby="candidate-list-title">
          <div className={styles.listHeader}>
            <div>
              <p className={styles.label}>{candidateCountLabel}</p>
              <h2 id="candidate-list-title">Candidates</h2>
            </div>
            <span className={styles.realtimeBadge}>Realtime on</span>
          </div>

          <form className={styles.filterBar} onSubmit={(event) => event.preventDefault()}>
            <label>
              Search
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Name or position"
                type="search"
                value={searchTerm}
              />
            </label>

            <label>
              Status
              <select
                onChange={(event) => setStatusFilter(event.target.value as CandidateStatus | "all")}
                value={statusFilter}
              >
                <option value="all">All statuses</option>
                {candidateStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              From
              <input
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
            </label>

            <label>
              To
              <input
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </label>

            <button type="button" onClick={handleResetFilters}>
              Reset
            </button>
          </form>

          {loadingCandidates ? (
            <p className={styles.mutedText}>Loading candidates...</p>
          ) : candidates.length === 0 ? (
            <p className={styles.mutedText}>No candidates match the current filters.</p>
          ) : (
            <>
              <div className={styles.candidateList}>
                {candidates.map((candidate) => (
                  <article className={styles.candidateItem} key={candidate.id}>
                    <div className={styles.candidateMain}>
                      <h3>{candidate.full_name}</h3>
                      <p>{candidate.applied_position}</p>
                      <time dateTime={candidate.created_at}>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(candidate.created_at))}
                      </time>
                    </div>

                    <div className={styles.candidateControls}>
                      <label>
                        Status
                        <select
                          disabled={updatingStatusId === candidate.id}
                          onChange={(event) =>
                            handleStatusChange(candidate.id, event.target.value as CandidateStatus)
                          }
                          value={candidate.status}
                        >
                          {candidateStatuses.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {candidate.resume_url ? (
                        <a href={candidate.resume_url} rel="noreferrer" target="_blank">
                          View resume
                        </a>
                      ) : (
                        <span className={styles.noResume}>No resume</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {hasMoreCandidates ? (
                <button
                  className={styles.loadMoreButton}
                  disabled={loadingMore}
                  onClick={() => fetchCandidatePage({ cursor: nextCursor, append: true })}
                  type="button"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              ) : null}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
