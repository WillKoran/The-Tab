import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { Wordmark } from "@/components/Wordmark";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/regulars")({
  component: RegularsPage,
});

interface Regular { id: string; name: string; phone: string }

function RegularsPage() {
  const [items, setItems] = useState<Regular[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function load() {
    const { data } = await supabase.from("regulars").select("*").order("name");
    setItems((data as any) || []);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("regulars").insert({ user_id: u.user.id, name: name.trim(), phone: phone.trim() });
    if (error) return toast.error(error.message);
    setName(""); setPhone("");
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("regulars").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="bg-ink text-paper px-6 pt-10 pb-8">
        <Wordmark tone="light" />
        <div className="mt-4 text-[0.62rem] tracking-[0.24em] text-paper/70">YOUR REGULARS · SAVED FRIENDS</div>
      </header>

      <section className="px-5 mt-6">
        <div className="paper-fold px-5 py-5 mb-5">
          <span className="fold-crease" />
          <h2 className="display text-lg uppercase text-ink mb-3">Add a regular</h2>
          <form onSubmit={add} className="space-y-3">
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Name</div>
              <input value={name} onChange={e => setName(e.target.value)} required />
            </label>
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">Phone</div>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </label>
            <button className="btn-ink w-full"><Plus size={14} className="mr-2" strokeWidth={3}/>Save friend</button>
          </form>
        </div>

        <div className="space-y-2">
          {items.length === 0 && <p className="text-brown text-sm text-center py-6">No regulars yet.</p>}
          {items.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-paper-2/60 border border-ink/10 px-4 py-3">
              <div>
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="mono text-xs text-brown">{r.phone || "—"}</div>
              </div>
              <button onClick={() => remove(r.id)} className="text-brown hover:text-burnt" aria-label="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <BottomNav />
    </div>
  );
}
