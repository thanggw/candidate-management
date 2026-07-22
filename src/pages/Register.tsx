import type { FormEvent } from "react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./Auth.module.scss";

export function Register() {
  const { signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormMessage("");
    setSubmitting(true);

    try {
      await signUp(email, password);
      setFormMessage("Account created. Check your email if confirmation is enabled.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="register-title">
        <div className={styles.header}>
          <p className={styles.eyebrow}>HR Portal</p>
          <h1 id="register-title">Create account</h1>
          <p>Start managing candidate applications.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete="new-password"
              minLength={6}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {formError ? <p className={styles.error}>{formError}</p> : null}
          {formMessage ? <p className={styles.success}>{formMessage}</p> : null}

          <button disabled={submitting} type="submit">
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have access? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
