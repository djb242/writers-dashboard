import { useEffect, useState } from "react";
import WritersDashboard from "./WritersDashboard";
import { supabase } from "./lib/supabase";

export default function App() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // 1) get current user on load
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    // 2) react to future auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  // Simple sign-in gate
  if (!userId) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginBottom: 12 }}>Sign in</h1>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          Continue with GitHub
        </button>
      </div>
    );
  }

  // PASS userId into your component (it already accepts { userId })
  return <WritersDashboard userId={userId} />;
}