import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { Wordmark } from "@/components/Wordmark";
import { Share2, LifeBuoy, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [venmo, setVenmo] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email || u.user.phone || "");
      const { data: p } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      setName((p?.name as string) || "");
      setVenmo((p?.venmo_handle as string) || "");
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { error } = await supabase.from("profiles").upsert({
      id: u.user.id, name, venmo_handle: venmo.replace(/^@/, ""),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }

  async function share() {
    const url = window.location.origin;
    if (navigator.share) {
      try { await navigator.share({ title: "The Tab", text: "Split dinner the easy way.", url }); }
      catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="bg-ink text-paper px-6 pt-10 pb-8">
        <Wordmark tone="light" />
        <div className="mt-4 text-[0.62rem] tracking-[0.24em] text-paper/70">ACCOUNT · SETTINGS</div>
      </header>

      <section className="px-5 mt-6 space-y-5">
        <div className="paper-fold px-5 py-5">
          <span className="fold-crease" />
          <h2 className="display text-lg uppercase text-ink mb-3">Profile</h2>
          <form onSubmit={save} className="space-y-3">
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Name</div>
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>
            <div>
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Account</div>
              <div className="mono text-sm text-ink">{email}</div>
            </div>
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Venmo handle</div>
              <input value={venmo} onChange={e => setVenmo(e.target.value)} placeholder="@your-venmo" />
            </label>
            <button className="btn-burnt w-full" disabled={saving}>{saving ? "…" : "Save changes"}</button>
          </form>
        </div>

        <div className="bg-ink text-paper px-5 py-5">
          <div className="text-[0.62rem] tracking-[0.24em] text-burnt font-bold mb-2">HOW SETTLING WORKS</div>
          <p className="text-sm leading-relaxed text-paper/85">
            The Tab never holds or moves your money. When you tap Settle Up, we open Venmo pre-filled with the correct amount so your friends can pay you directly.
          </p>
        </div>

        <div className="space-y-2">
          <a href="mailto:help@thetab.app?subject=Need%20Help%20with%20The%20Tab" className="btn-ghost w-full">
            <LifeBuoy size={14} className="mr-2" /> Need help?
          </a>
          <button onClick={share} className="btn-ghost w-full">
            <Share2 size={14} className="mr-2" /> Share The Tab
          </button>
          <button onClick={signOut} className="btn-ghost w-full text-burnt border-burnt">
            <LogOut size={14} className="mr-2" /> Log out
          </button>
        </div>
      </section>

      <BottomNav />
    </div>
  );
}
