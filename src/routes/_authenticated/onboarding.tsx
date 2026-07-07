import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const nav = useNavigate();
  const [venmo, setVenmo] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata?.name as string) || "";
      setName(meta);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoading(false); return; }
    const handle = venmo.trim().replace(/^@/, "");
    const { error } = await supabase.from("profiles").upsert({
      id: userData.user.id,
      name,
      venmo_handle: handle,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("You're all set");
    nav({ to: "/home" });
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="bg-ink text-paper px-6 py-8 mb-6">
          <Wordmark tone="light" />
          <div className="mt-4 text-[0.62rem] tracking-[0.24em] text-paper/70">STEP 02 · CONNECT VENMO</div>
        </div>
        <div className="paper-fold px-6 py-7">
          <span className="fold-crease" />
          <h1 className="display text-2xl uppercase text-ink">Your Venmo</h1>
          <p className="text-sm text-brown mt-2 mb-5">
            We'll use this to open Venmo pre-filled when guests settle up. The Tab never holds or moves your money.
          </p>
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Name on the check</div>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Venmo handle</div>
              <input type="text" required placeholder="@your-venmo" value={venmo} onChange={e => setVenmo(e.target.value)} />
            </label>
            <button className="btn-burnt w-full mt-2" disabled={loading}>{loading ? "…" : "Save & continue"}</button>
            <button type="button" onClick={() => nav({ to: "/home" })} className="w-full text-[0.72rem] tracking-[0.16em] uppercase font-semibold text-brown pt-2">Skip for now</button>
          </form>
        </div>
      </div>
    </div>
  );
}
