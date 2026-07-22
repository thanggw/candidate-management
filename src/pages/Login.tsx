import type { FormEvent } from "react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./Auth.module.scss";

type RouteState = {
  from?: {
    pathname?: string;
  };
};

export function Login() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as RouteState | null)?.from?.pathname ?? "/dashboard";

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.header}>
          <p className={styles.eyebrow}>HR Portal</p>
          <h1 id="login-title">Sign in</h1>
          <p>Access your candidate workspace.</p>
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
              autoComplete="current-password"
              minLength={6}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {formError ? <p className={styles.error}>{formError}</p> : null}

          <button disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className={styles.switchText}>
          New to the system? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
