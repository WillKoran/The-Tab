import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPassword,
});

function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    nav({ to: "/home" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md paper-fold px-6 py-8">
        <span className="fold-crease" />
        <h1 className="display text-2xl uppercase text-ink mb-4">Set new password</h1>
        {!ready ? (
          <p className="text-brown text-sm">Open this page from the reset link in your email.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">New password</div>
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <button className="btn-burnt w-full" disabled={loading}>{loading ? "…" : "Update password"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
