import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";
import { InviteGuestButton } from "@/components/InviteGuestButton";
import { Check, Plus, Camera, ChevronLeft, Trash2, X } from "lucide-react";
import { computeTotals, money, venmoDeepLink, type Guest, type Item } from "@/lib/tab-math";
import { upsertGuestUser } from "@/lib/guests";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tab/$id")({
  component: TabScreen,
});

interface TabRow {
  id: string;
  name: string;
  table_label: string | null;
  tax_value: number;
  tax_is_percent: boolean;
  tip_value: number;
  tip_is_percent: boolean;
  settled: boolean;
  created_at: string;
}
interface Regular {
  id: string;
  name: string;
  phone: string;
}

function TabScreen() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<TabRow | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [hostVenmo, setHostVenmo] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [{ data: t }, { data: g }, { data: i }, { data: r }, { data: u }] = await Promise.all([
      supabase.from("tabs").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("tab_guests")
        .select("*, guest_identities(phone_number)")
        .eq("tab_id", id)
        .order("created_at"),
      supabase
        .from("tab_items")
        .select("*, tab_item_assignments(guest_id)")
        .eq("tab_id", id)
        .order("created_at"),
      supabase.from("regulars").select("*").order("name"),
      supabase.auth.getUser(),
    ]);
    setTab(t as any);
    setGuests(
      ((g as any) || []).map((x: any) => ({
        ...x,
        phone_number: x.guest_identities?.phone_number ?? null,
      })),
    );
    setItems(
      ((i as any) || []).map((x: any) => ({
        id: x.id,
        name: x.name,
        price: Number(x.price),
        quantity: x.quantity,
        category: x.category,
        guest_ids: (x.tab_item_assignments || []).map((a: any) => a.guest_id),
      })),
    );
    setRegulars((r as any) || []);
    if (u.user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("venmo_handle")
        .eq("id", u.user.id)
        .maybeSingle();
      setHostVenmo((p?.venmo_handle as string) || "");
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [id]);

  const totals = useMemo(
    () =>
      tab
        ? computeTotals(
            items,
            guests,
            { value: Number(tab.tax_value), isPercent: tab.tax_is_percent },
            { value: Number(tab.tip_value), isPercent: tab.tip_is_percent },
          )
        : null,
    [items, guests, tab],
  );

  async function addGuest(name: string, phone?: string, venmo?: string) {
    if (!name.trim()) return;
    let guestIdentityId: string | undefined;
    if (phone && phone.trim()) {
      try {
        guestIdentityId = (await upsertGuestUser(phone, name.trim())).id;
      } catch (e) {
        return toast.error(e instanceof Error ? e.message : "Invalid phone number");
      }
    }
    const { error } = await supabase.from("tab_guests").insert({
      tab_id: id,
      name: name.trim(),
      is_you: false,
      venmo_handle: venmo || "",
      guest_identity_id: guestIdentityId,
    });
    if (error) return toast.error(error.message);
    load();
  }
  async function removeGuest(gid: string) {
    await supabase.from("tab_guests").delete().eq("id", gid);
    load();
  }
  async function saveTaxTip(patch: Partial<TabRow>) {
    if (!tab) return;
    const next = { ...tab, ...patch };
    setTab(next);
    await supabase.from("tabs").update(patch).eq("id", id);
  }
  async function addItem(
    name: string,
    price: number,
    quantity: number,
    category: string,
    guestIds: string[],
  ) {
    const { data, error } = await supabase
      .from("tab_items")
      .insert({
        tab_id: id,
        name,
        price,
        quantity,
        category,
      })
      .select()
      .single();
    if (error || !data) return toast.error(error?.message || "Failed");
    if (guestIds.length) {
      await supabase
        .from("tab_item_assignments")
        .insert(guestIds.map((gid) => ({ item_id: data.id, guest_id: gid })));
    }
    load();
  }
  async function removeItem(iid: string) {
    await supabase.from("tab_items").delete().eq("id", iid);
    load();
  }
  async function updateItem(
    iid: string,
    patch: { name?: string; price?: number; quantity?: number },
  ) {
    setItems((cur) => cur.map((it) => (it.id === iid ? { ...it, ...patch } : it)));
    await supabase.from("tab_items").update(patch).eq("id", iid);
  }
  function handleReceiptCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    toast.message("Got the photo — receipt scanning isn't set up yet, add items manually for now.");
  }
  async function toggleAssign(itemId: string, guestId: string) {
    const item = items.find((x) => x.id === itemId);
    if (!item) return;
    if (item.guest_ids.includes(guestId)) {
      await supabase
        .from("tab_item_assignments")
        .delete()
        .eq("item_id", itemId)
        .eq("guest_id", guestId);
    } else {
      await supabase.from("tab_item_assignments").insert({ item_id: itemId, guest_id: guestId });
    }
    load();
  }
  async function markSettled() {
    await supabase.from("tabs").update({ settled: true }).eq("id", id);
    toast.success("Tab settled");
    setShowSettle(false);
    nav({ to: "/home" });
  }
  async function deleteTab() {
    if (!confirm("Delete this tab?")) return;
    await supabase.from("tabs").delete().eq("id", id);
    nav({ to: "/home" });
  }

  if (loading || !tab || !totals) {
    return (
      <div className="min-h-screen flex items-center justify-center text-brown mono text-sm">
        loading…
      </div>
    );
  }

  const foodItems = items.filter((i) => i.category === "food");
  const drinkItems = items.filter((i) => i.category === "drinks");
  const otherItems = items.filter((i) => i.category !== "food" && i.category !== "drinks");
  const groups: [string, Item[]][] = [
    ["Food", foodItems],
    ["Drinks", drinkItems],
  ];
  if (otherItems.length) groups.push(["Other", otherItems]);

  const date = new Date(tab.created_at);
  const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-ink/10 px-4 py-3 flex items-center justify-between">
        <Link
          to="/home"
          className="flex items-center gap-1 text-[0.7rem] tracking-[0.2em] uppercase font-bold text-ink"
        >
          <ChevronLeft size={16} /> Home
        </Link>
        <button onClick={deleteTab} className="text-brown text-xs tracking-[0.16em] uppercase">
          Delete
        </button>
      </div>

      {/* Big navy header */}
      <header className="bg-ink text-paper px-6 pt-8 pb-10 flex items-start justify-between">
        <Wordmark tone="light" />
        <div className="text-right">
          <input
            value={tab.table_label || ""}
            onChange={(e) => saveTaxTip({ table_label: e.target.value.toUpperCase() })}
            className="bg-transparent border-0 text-burnt text-right text-sm tracking-[0.24em] uppercase font-bold p-0 focus:ring-0"
            style={{ boxShadow: "none", padding: 0, width: "8rem" }}
          />
          <div className="text-[0.68rem] tracking-[0.2em] text-paper/60 mono mt-1">
            {dateLabel}, {timeLabel}
          </div>
          <div className="h-[2px] w-8 bg-burnt ml-auto mt-1" />
        </div>
      </header>

      <main className="px-4 -mt-6 space-y-6 pb-40">
        {/* Dinner crew */}
        <div className="paper-fold overflow-hidden">
          <span className="fold-crease" />
          <div className="flex">
            <div className="w-1.5 bg-burnt" />
            <div className="flex-1 px-5 py-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="display text-lg uppercase text-ink">Dinner Crew</h2>
                <button onClick={() => setShowAddGuest(true)} className="stamp stamp-burnt">
                  <Plus size={10} strokeWidth={3} /> Add
                </button>
              </div>
              <div>
                {guests.length === 0 && (
                  <p className="text-brown text-sm py-2">Add yourself and your friends.</p>
                )}
                {guests.map((g, idx) => (
                  <div key={g.id}>
                    <div className="flex items-center gap-2 py-2.5">
                      <Check size={14} strokeWidth={3} className="text-ink shrink-0" />
                      <span className="font-semibold text-ink">{g.name}</span>
                      {g.is_you && (
                        <span className="stamp stamp-solid text-[0.55rem] py-[2px] px-1.5">
                          You
                        </span>
                      )}
                      <span className="ml-auto mono font-bold text-burnt">
                        {money(totals.perGuestTotal[g.id] ?? 0)}
                      </span>
                      {!g.is_you && (
                        <button
                          onClick={() => removeGuest(g.id)}
                          className="text-brown/70 hover:text-burnt ml-2"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {!g.is_you && !g.user_id && g.phone_number && (
                      <div className="pb-3">
                        <InviteGuestButton
                          phoneNumber={g.phone_number}
                          claimUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/join/${g.claim_token}`}
                          guestName={g.name}
                        />
                      </div>
                    )}
                    {idx < guests.length - 1 && <div className="hairline" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* What we had */}
        <div className="paper-fold px-5 py-5">
          <span className="fold-crease" />
          <div className="flex items-center justify-between mb-3">
            <h2 className="display text-lg uppercase text-ink">What we had</h2>
            <button onClick={() => receiptInputRef.current?.click()} className="stamp stamp-burnt">
              <Camera size={10} strokeWidth={3} /> Scan your receipt
            </button>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleReceiptCapture}
              className="hidden"
            />
          </div>
          <button
            onClick={() => setShowAddItem(true)}
            className="w-full mb-4 py-2 border border-ink/25 text-ink text-[0.7rem] tracking-[0.16em] uppercase font-bold flex items-center justify-center gap-1.5 hover:bg-tan/40"
          >
            <Plus size={12} strokeWidth={3} /> Add item manually
          </button>

          {items.length === 0 && <p className="text-brown text-sm py-3">No items yet.</p>}

          {groups.map(
            ([label, list], gi) =>
              list.length > 0 && (
                <div key={label} className={gi > 0 ? "mt-4 pt-4 border-t border-ink/10" : ""}>
                  <div className="text-[0.6rem] tracking-[0.24em] uppercase text-brown font-bold mb-2">
                    {label}
                  </div>
                  {list.map((it, idx) => (
                    <div key={it.id}>
                      <div className="py-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(it.id, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-9 h-9 bg-tan text-center mono text-xs font-bold text-ink shrink-0 rounded-sm border border-ink/20 p-0 focus:outline-none focus:border-burnt focus:ring-1 focus:ring-burnt/40"
                            style={{ boxShadow: "none" }}
                          />
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            className="flex-1 min-w-0 uppercase text-sm font-semibold text-ink tracking-[0.06em] bg-transparent rounded-sm border border-ink/20 px-2 py-1.5 focus:outline-none focus:border-burnt focus:ring-1 focus:ring-burnt/40"
                            style={{ boxShadow: "none" }}
                          />
                          <div className="flex items-center gap-1 shrink-0 rounded-sm border border-ink/20 px-1.5 py-1.5 focus-within:border-burnt focus-within:ring-1 focus-within:ring-burnt/40">
                            <span className="mono text-xs text-brown">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.price}
                              onChange={(e) =>
                                updateItem(it.id, { price: Number(e.target.value) || 0 })
                              }
                              className="w-14 mono font-bold text-ink text-right bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                              style={{ boxShadow: "none" }}
                            />
                          </div>
                          <button
                            onClick={() => removeItem(it.id)}
                            className="text-brown/60 hover:text-burnt ml-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {it.quantity > 1 && (
                          <div className="text-[0.62rem] text-brown mono pl-11 -mt-1">
                            {it.quantity} × {money(it.price)} = {money(it.price * it.quantity)}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-9">
                          {guests.map((g) => {
                            const on = it.guest_ids.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => toggleAssign(it.id, g.id)}
                                className={`px-2 py-0.5 text-[0.62rem] tracking-[0.14em] uppercase font-bold border ${on ? "bg-ink text-paper border-ink" : "text-brown border-ink/25 bg-transparent"}`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {idx < list.length - 1 && <div className="hairline" />}
                    </div>
                  ))}
                </div>
              ),
          )}
        </div>

        {/* Grand total banner */}
        <div className="bg-burnt text-paper px-5 py-5 flex items-center justify-between">
          <div>
            <div className="text-[0.62rem] tracking-[0.28em] uppercase text-paper/80 font-bold">
              Grand Total
            </div>
            <div className="script text-xl text-paper/90 -mt-1">thank you!</div>
          </div>
          <div className="mono display font-bold text-4xl">{money(totals.grandTotal)}</div>
        </div>

        {/* Tax & tip */}
        <div className="paper-fold px-5 py-5">
          <span className="fold-crease" />
          <h2 className="display text-lg uppercase text-ink mb-3">Tax &amp; Tip</h2>
          <div className="flex gap-4">
            <TaxTipRow
              label="Tax"
              value={tab.tax_value}
              isPercent={tab.tax_is_percent}
              onValue={(v) => saveTaxTip({ tax_value: v })}
              onToggle={(p) => saveTaxTip({ tax_is_percent: p })}
            />
            <TaxTipRow
              label="Tip"
              value={tab.tip_value}
              isPercent={tab.tip_is_percent}
              onValue={(v) => saveTaxTip({ tip_value: v })}
              onToggle={(p) => saveTaxTip({ tip_is_percent: p })}
            />
          </div>
          {tab.tip_is_percent && (
            <div className="flex gap-1.5 mt-2">
              {[15, 18, 20, 25].map((p) => (
                <button
                  key={p}
                  onClick={() => saveTaxTip({ tip_value: p, tip_is_percent: true })}
                  className={`flex-1 py-1 text-[0.6rem] tracking-[0.1em] uppercase font-bold border ${Number(tab.tip_value) === p ? "bg-ink text-paper border-ink" : "border-ink/25 text-ink"}`}
                >
                  {p}%
                </button>
              ))}
            </div>
          )}
          <p className="text-[0.68rem] text-brown mt-3 leading-snug">
            Tax and tip are split by each person's share of the bill, not evenly.
          </p>
        </div>

        {/* Who owes what — navy */}
        <div className="bg-ink text-paper px-5 py-6">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-xl uppercase text-paper">Who Owes What</h2>
            <span className="text-[0.6rem] tracking-[0.22em] text-paper/60 uppercase">
              After Tax &amp; Tip
            </span>
          </div>
          <div className="h-px bg-paper/20 my-4" />
          {guests.map((g, idx) => (
            <div key={g.id}>
              <div className="flex items-center py-3">
                <span className="font-semibold text-paper">{g.name}</span>
                {g.is_you && (
                  <span className="stamp stamp-ink ml-2 text-[0.55rem] py-[2px] px-1.5">You</span>
                )}
                <span className="ml-auto mono font-bold text-burnt text-lg">
                  {money(totals.perGuestTotal[g.id] ?? 0)}
                </span>
              </div>
              {idx < guests.length - 1 && <div className="h-px bg-paper/15" />}
            </div>
          ))}
        </div>

        <button onClick={() => setShowSettle(true)} className="btn-burnt w-full text-base py-4">
          Settle Up
        </button>
        <p className="text-[0.68rem] text-brown text-center leading-snug">
          The Tab never holds or moves your money — we just open Venmo with the amount ready to
          send.
        </p>
      </main>

      {showAddGuest && (
        <AddGuestSheet
          onClose={() => setShowAddGuest(false)}
          onAdd={addGuest}
          regulars={regulars}
        />
      )}
      {showAddItem && (
        <AddItemSheet onClose={() => setShowAddItem(false)} onAdd={addItem} guests={guests} />
      )}
      {showSettle && totals && (
        <SettleSheet
          onClose={() => setShowSettle(false)}
          onSettle={markSettled}
          hostVenmo={hostVenmo}
          guests={guests}
          perGuest={totals.perGuestTotal}
          tabName={tab.name}
        />
      )}
    </div>
  );
}

function TaxTipRow({
  label,
  value,
  isPercent,
  onValue,
  onToggle,
}: {
  label: string;
  value: number;
  isPercent: boolean;
  onValue: (v: number) => void;
  onToggle: (isPercent: boolean) => void;
}) {
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="text-[0.72rem] tracking-[0.22em] uppercase font-bold text-brown">
          {label}
        </div>
        <div className="flex border border-ink/25 shrink-0">
          <button
            type="button"
            onClick={() => onToggle(true)}
            className={`px-2 py-1 text-[0.7rem] font-bold ${isPercent ? "bg-ink text-paper" : "text-ink"}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={`px-2 py-1 text-[0.7rem] font-bold ${!isPercent ? "bg-ink text-paper" : "text-ink"}`}
          >
            $
          </button>
        </div>
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onValue(Number(e.target.value) || 0)}
        className="w-full min-w-0 mono"
      />
    </div>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-paper max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function AddGuestSheet({
  onClose,
  onAdd,
  regulars,
}: {
  onClose: () => void;
  onAdd: (name: string, phone?: string, venmo?: string) => void;
  regulars: { id: string; name: string; phone: string }[];
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Sheet onClose={onClose}>
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-xl uppercase text-ink">Add guest</h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !phone.trim()) return;
            onAdd(name, phone);
            setName("");
            setPhone("");
          }}
          className="space-y-3"
        >
          <label className="block">
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
              Name
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="block">
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
              Phone
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="555-123-4567"
            />
          </label>
          <button className="btn-ink w-full">Add to tab</button>
        </form>
        {regulars.length > 0 && (
          <div className="mt-5">
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-2">
              From Regulars
            </div>
            <div className="grid grid-cols-2 gap-2">
              {regulars.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onAdd(r.name, r.phone)}
                  className="bg-tan/60 border border-ink/15 px-3 py-2 text-left hover:bg-tan"
                >
                  <div className="font-semibold text-ink text-sm">{r.name}</div>
                  <div className="mono text-xs text-brown">{r.phone || "—"}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={onClose} className="btn-ghost w-full mt-5">
          Done
        </button>
      </div>
    </Sheet>
  );
}

function AddItemSheet({
  onClose,
  onAdd,
  guests,
}: {
  onClose: () => void;
  onAdd: (
    name: string,
    price: number,
    quantity: number,
    category: string,
    guestIds: string[],
  ) => void;
  guests: Guest[];
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<"food" | "drinks">("food");
  const [selected, setSelected] = useState<string[]>(guests.map((g) => g.id));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(name.trim(), Number(price) || 0, Math.max(1, Number(quantity) || 1), category, selected);
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-xl uppercase text-ink">Add item</h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
              Item
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Rigatoni alla vodka"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
                Qty
              </div>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mono"
              />
            </label>
            <label className="block">
              <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
                Price
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="mono"
                placeholder="24.00"
              />
            </label>
          </div>
          <div>
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
              Category
            </div>
            <div className="flex gap-2">
              {(["food", "drinks"] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`flex-1 py-2 text-[0.7rem] tracking-[0.2em] uppercase font-bold border ${category === c ? "bg-ink text-paper border-ink" : "text-ink border-ink/25"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">
              Split between
            </div>
            <div className="flex flex-wrap gap-1.5">
              {guests.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => toggle(g.id)}
                  className={`px-2.5 py-1 text-[0.7rem] tracking-[0.12em] uppercase font-bold border ${selected.includes(g.id) ? "bg-ink text-paper border-ink" : "text-brown border-ink/25"}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-burnt w-full mt-2">Add item</button>
        </form>
      </div>
    </Sheet>
  );
}

function SettleSheet({
  onClose,
  onSettle,
  hostVenmo,
  guests,
  perGuest,
  tabName,
}: {
  onClose: () => void;
  onSettle: () => void;
  hostVenmo: string;
  guests: Guest[];
  perGuest: Record<string, number>;
  tabName: string;
}) {
  const others = guests.filter((g) => !g.is_you);
  const note = `${tabName} — The Tab`;
  return (
    <Sheet onClose={onClose}>
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-xl uppercase text-ink">Settle up</h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {!hostVenmo ? (
          <p className="text-sm text-brown mb-4">
            Add your Venmo handle in Account to generate request links.
          </p>
        ) : (
          <p className="text-sm text-brown mb-4">
            Each friend can tap Request to open Venmo pre-filled with what they owe you at{" "}
            <span className="mono">@{hostVenmo}</span>.
          </p>
        )}
        <div className="space-y-2 mb-5">
          {others.map((g) => {
            const amt = perGuest[g.id] || 0;
            const link = hostVenmo ? venmoDeepLink(hostVenmo, amt, note) : "";
            return (
              <div key={g.id} className="flex items-center gap-3 py-2 border-b border-ink/10">
                <div className="font-semibold text-ink flex-1">{g.name}</div>
                <div className="mono font-bold text-burnt">{money(amt)}</div>
                {hostVenmo ? (
                  <a href={link} className="btn-ink text-xs py-2 px-3">
                    Request
                  </a>
                ) : (
                  <span className="text-xs text-brown">—</span>
                )}
              </div>
            );
          })}
          {others.length === 0 && <p className="text-brown text-sm">Just you here.</p>}
        </div>
        <button onClick={onSettle} className="btn-burnt w-full">
          Mark as settled
        </button>
        <p className="text-[0.68rem] text-brown text-center mt-3 leading-snug">
          The Tab never holds or moves your money — we just open Venmo.
        </p>
      </div>
    </Sheet>
  );
}
