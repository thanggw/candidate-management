import type { ChangeEvent, FormEvent } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
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

type AddCandidateResponse = {
  candidate?: Candidate;
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

function sortCandidates(candidates: Candidate[]) {
  return [...candidates].sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export function Dashboard() {
  const { signOut, user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [fullName, setFullName] = useState("");
  const [appliedPosition, setAppliedPosition] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const candidateCountLabel = useMemo(() => {
    if (candidates.length === 1) {
      return "1 candidate";
    }

    return `${candidates.length} candidates`;
  }, [candidates.length]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;

    async function fetchCandidates() {
      setLoadingCandidates(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("candidates")
        .select("id, user_id, full_name, applied_position, status, resume_url, created_at")
        .order("created_at", { ascending: false });

      if (!active) {
        return;
      }

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setCandidates((data ?? []) as Candidate[]);
      }

      setLoadingCandidates(false);
    }

    fetchCandidates();

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
            const existingIndex = currentCandidates.findIndex(
              (candidate) => candidate.id === nextCandidate.id,
            );

            if (existingIndex === -1) {
              return sortCandidates([nextCandidate, ...currentCandidates]);
            }

            const nextCandidates = [...currentCandidates];
            nextCandidates[existingIndex] = nextCandidate;

            return sortCandidates(nextCandidates);
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setResumeFile(event.target.files?.[0] ?? null);
  }

  async function handleAddCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      event.currentTarget.reset();
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
            <input accept="application/pdf" name="resume" onChange={handleFileChange} required type="file" />
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

          {loadingCandidates ? (
            <p className={styles.mutedText}>Loading candidates...</p>
          ) : candidates.length === 0 ? (
            <p className={styles.mutedText}>No candidates yet.</p>
          ) : (
            <div className={styles.candidateList}>
              {candidates.map((candidate) => (
                <article className={styles.candidateItem} key={candidate.id}>
                  <div className={styles.candidateMain}>
                    <h3>{candidate.full_name}</h3>
                    <p>{candidate.applied_position}</p>
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
          )}
        </section>
      </section>
    </main>
  );
}
