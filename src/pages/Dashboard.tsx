import { useAuth } from "../context/AuthContext";
import styles from "./Dashboard.module.scss";

export function Dashboard() {
  const { signOut, user } = useAuth();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Candidate Management</p>
          <h1>Dashboard</h1>
        </div>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section className={styles.emptyState}>
        <p className={styles.label}>Signed in as</p>
        <p className={styles.email}>{user?.email}</p>
      </section>
    </main>
  );
}
