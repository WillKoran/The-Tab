import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";
import { BottomNav } from "@/components/BottomNav";
import { Plus } from "lucide-react";
import { computeTotals, money, type Item, type Guest } from "@/lib/tab-math";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/home")({
  component: Home,
});

interface TabRow {
  id: string;
  name: string;
  table_label: string | null;
  settled: boolean;
  created_at: string;
  tax_value: number; tax_is_percent: boolean;
  tip_value: number; tip_is_percent: boolean;
  tab_guests: Guest[];
  tab_items: (Item & { tab_item_assignments: { guest_id: string }[] })[];
}
interface Regular { id: string; name: string; phone: string }

function Home() {
  const nav = useNavigate();
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: t }, { data: r }, { data: u }] = await Promise.all([
      supabase.from("tabs").select("*, tab_guests(*), tab_items(*, tab_item_assignments(guest_id))").order("created_at", { ascending: false }).limit(20),
      supabase.from("regulars").select("*").order("name"),
      supabase.auth.getUser(),
    ]);
    setTabs((t as any) || []);
    setRegulars((r as any) || []);
    if (u.user) {
      const { data: p } = await supabase.from("profiles").select("name").eq("id", u.user.id).maybeSingle();
      setProfileName((p?.name as string) || "");
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function openNewTab() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: profile } = await supabase.from("profiles").select("name, venmo_handle").eq("id", userData.user.id).maybeSingle();
    const { data: tab, error } = await supabase.from("tabs").insert({
      user_id: userData.user.id,
      name: "Dinner",
      table_label: "TABLE 1",
    }).select().single();
    if (error || !tab) return toast.error(error?.message || "Could not open tab");
    await supabase.from("tab_guests").insert({
      tab_id: tab.id,
      name: (profile?.name as string) || "You",
      is_you: true,
      venmo_handle: (profile?.venmo_handle as string) || "",
    });
    nav({ to: "/tab/$id", params: { id: tab.id } });
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="bg-ink text-paper px-6 pt-10 pb-8">
        <div className="flex items-end justify-between">
          <Wordmark tone="light" />
          <div className="text-right">
            <div className="text-[0.62rem] tracking-[0.24em] text-burnt font-bold">HELLO</div>
            <div className="text-sm mono">{profileName || "friend"}</div>
          </div>
        </div>
        <button onClick={openNewTab} className="btn-burnt w-full mt-6">
          <Plus size={16} className="mr-2" strokeWidth={3} /> Open a Tab
        </button>
      </header>

      <section className="px-5 mt-6">
        <SectionHeader title="Recent Checks" note={loading ? "loading…" : `${tabs.length}`} />
        {tabs.length === 0 && !loading && (
          <div className="paper-fold px-5 py-6 text-center">
            <span className="fold-crease" />
            <p className="text-brown text-sm">No checks yet. Open your first tab to get started.</p>
          </div>
        )}
        <div className="space-y-3">
          {tabs.map(tab => <TabCard key={tab.id} tab={tab} />)}
        </div>
      </section>

      <section className="px-5 mt-8">
        <div className="flex items-center justify-between">
          <SectionHeader title="Regulars" note={`${regulars.length}`} />
          <Link to="/regulars" className="text-[0.7rem] tracking-[0.2em] uppercase font-bold text-burnt">Manage →</Link>
        </div>
        {regulars.length === 0 ? (
          <div className="paper-fold px-5 py-6 text-center">
            <span className="fold-crease" />
            <p className="text-brown text-sm">Save the friends you split with the most.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {regulars.slice(0, 6).map(r => (
              <div key={r.id} className="bg-tan/60 border border-ink/10 px-3 py-3">
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="mono text-xs text-brown">{r.phone || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  );
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="display text-lg uppercase text-ink tracking-[0.05em]">{title}</h2>
      {note && <span className="mono text-[0.7rem] text-brown">{note}</span>}
    </div>
  );
}

function TabCard({ tab }: { tab: TabRow }) {
  const items: Item[] = (tab.tab_items || []).map(i => ({
    id: i.id, name: i.name, price: Number(i.price), quantity: i.quantity, category: i.category,
    guest_ids: (i.tab_item_assignments || []).map(a => a.guest_id),
  }));
  const totals = computeTotals(items, tab.tab_guests || [],
    { value: Number(tab.tax_value), isPercent: tab.tax_is_percent },
    { value: Number(tab.tip_value), isPercent: tab.tip_is_percent });

  const date = new Date(tab.created_at);
  const initials = (tab.tab_guests || []).slice(0, 4).map(g => g.name.charAt(0).toUpperCase());

  return (
    <Link to="/tab/$id" params={{ id: tab.id }} className="block paper-fold px-4 py-4 hover:translate-x-[1px] transition-transform">
      <span className="fold-crease" />
      <div className="flex items-start justify-between">
        <div>
          <div className="display text-lg uppercase text-ink">{tab.name}</div>
          <div className="text-[0.68rem] tracking-[0.18em] uppercase text-brown mono mt-0.5">
            {date.toLocaleDateString([], { month: "short", day: "numeric" })} · {tab.table_label || "—"}
          </div>
        </div>
        <span className={`stamp ${tab.settled ? "stamp-burnt" : ""}`}>{tab.settled ? "Settled" : "Open"}</span>
      </div>
      <div className="hairline my-3" />
      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {initials.map((c, i) => (
            <div key={i} className="w-6 h-6 rounded-full bg-tan border border-paper flex items-center justify-center text-[0.65rem] font-bold text-ink">{c}</div>
          ))}
          {(tab.tab_guests || []).length > 4 && (
            <div className="w-6 h-6 rounded-full bg-ink border border-paper flex items-center justify-center text-[0.6rem] font-bold text-paper">+{tab.tab_guests.length - 4}</div>
          )}
        </div>
        <div className="mono text-lg font-bold text-burnt">{money(totals.grandTotal)}</div>
      </div>
    </Link>
  );
}
