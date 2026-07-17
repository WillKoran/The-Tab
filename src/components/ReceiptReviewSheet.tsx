import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { money } from "@/lib/tab-math";
import type { ScannedReceipt } from "@/lib/receipt-ocr";

interface DraftItem {
  key: string;
  name: string;
  price: string;
  quantity: string;
}

function toDraftItems(receipt: ScannedReceipt): DraftItem[] {
  return receipt.items.map((it, i) => ({
    key: `${i}-${Math.random().toString(36).slice(2)}`,
    name: it.name,
    price: String(it.price),
    quantity: String(it.quantity || 1),
  }));
}

// null gemini value -> blank + unresolved until the user types something
// (including "0"), which is what "explicitly confirm $0" means here.
function toAmountField(value: number | null): { mode: "$" | "%"; input: string } {
  return { mode: "$", input: value === null ? "" : String(value) };
}

export interface ReceiptConfirmResult {
  items: { name: string; price: number; quantity: number }[];
  tax: { value: number; isPercent: boolean };
  tip: { value: number; isPercent: boolean };
}

export function ReceiptReviewSheet({
  receipt,
  onClose,
  onConfirm,
}: {
  receipt: ScannedReceipt;
  onClose: () => void;
  onConfirm: (result: ReceiptConfirmResult) => Promise<void> | void;
}) {
  const [items, setItems] = useState<DraftItem[]>(() => toDraftItems(receipt));
  const [tax, setTax] = useState(() => toAmountField(receipt.tax));
  const [tip, setTip] = useState(() => toAmountField(receipt.tip));
  const [submitting, setSubmitting] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0),
    [items],
  );

  const taxAmount = useMemo(() => amountFor(tax, subtotal), [tax, subtotal]);
  const tipAmount = useMemo(() => amountFor(tip, subtotal), [tip, subtotal]);
  const grandTotal = subtotal + taxAmount + tipAmount;

  const taxReady = tax.input.trim() !== "" && Number.isFinite(Number(tax.input));
  const tipReady = tip.input.trim() !== "" && Number.isFinite(Number(tip.input));
  const hasItems = items.some((it) => it.name.trim() && Number(it.price) >= 0);
  const canConfirm = hasItems && taxReady && tipReady && !submitting;

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: string) {
    setItems((cur) => cur.filter((it) => it.key !== key));
  }
  function addItem() {
    setItems((cur) => [
      ...cur,
      { key: `new-${Math.random().toString(36).slice(2)}`, name: "", price: "", quantity: "1" },
    ]);
  }

  function toggleMode(field: "tax" | "tip", mode: "$" | "%") {
    const [state, setState] = field === "tax" ? [tax, setTax] : [tip, setTip];
    if (state.mode === mode) return;
    const current = Number(state.input);
    if (!Number.isFinite(current) || state.input.trim() === "") {
      setState({ mode, input: state.input });
      return;
    }
    const currentDollars = state.mode === "%" ? subtotal * (current / 100) : current;
    const nextValue =
      mode === "%"
        ? subtotal > 0
          ? round2((currentDollars / subtotal) * 100)
          : 0
        : round2(currentDollars);
    setState({ mode, input: String(nextValue) });
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm({
        items: items
          .filter((it) => it.name.trim())
          .map((it) => ({
            name: it.name.trim(),
            price: Number(it.price) || 0,
            quantity: Math.max(1, Math.round(Number(it.quantity)) || 1),
          })),
        tax: { value: Number(tax.input) || 0, isPercent: tax.mode === "%" },
        tip: { value: Number(tip.input) || 0, isPercent: tip.mode === "%" },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50">
      <div className="w-full max-w-md bg-paper max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="display text-xl uppercase text-ink">Review receipt</h3>
            <button onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
          {receipt.merchant && (
            <p className="text-brown text-sm mb-4">
              {receipt.merchant}
              {receipt.date ? ` · ${receipt.date}` : ""}
            </p>
          )}
          {!receipt.merchant && <div className="mb-4" />}

          <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-2">
            Items
          </div>
          <div className="space-y-2 mb-2">
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={it.quantity}
                  onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                  className="w-12 h-9 text-center mono text-xs font-bold p-0"
                  aria-label="Quantity"
                />
                <input
                  type="text"
                  value={it.name}
                  onChange={(e) => updateItem(it.key, { name: e.target.value })}
                  placeholder="Item name"
                  className="flex-1 min-w-0 text-sm font-semibold px-2 py-1.5"
                  aria-label="Item name"
                />
                <div className="flex items-center gap-1 shrink-0 rounded-sm border border-ink/20 px-1.5 py-1.5 focus-within:border-burnt focus-within:ring-1 focus-within:ring-burnt/40">
                  <span className="mono text-xs text-brown">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={it.price}
                    onChange={(e) => updateItem(it.key, { price: e.target.value })}
                    className="w-16 mono font-bold text-right bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                    style={{ boxShadow: "none" }}
                    aria-label="Price"
                  />
                </div>
                <button
                  onClick={() => removeItem(it.key)}
                  className="text-brown/60 hover:text-burnt shrink-0"
                  aria-label="Remove item"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-brown text-sm py-2">No items — add one below.</p>
            )}
          </div>
          <button
            onClick={addItem}
            className="w-full mb-4 py-2 border border-ink/25 text-ink text-[0.7rem] tracking-[0.16em] uppercase font-bold flex items-center justify-center gap-1.5 hover:bg-tan/40"
          >
            <Plus size={12} strokeWidth={3} /> Add item
          </button>

          <div className="flex items-center justify-between py-2 border-t border-ink/10">
            <span className="text-sm font-semibold text-ink">Subtotal</span>
            <span className="mono font-bold text-ink">{money(subtotal)}</span>
          </div>

          <div className="flex gap-4 py-3 border-t border-ink/10">
            <AmountField
              label="Tax"
              state={tax}
              onInput={(input) => setTax((s) => ({ ...s, input }))}
              onModeChange={(mode) => toggleMode("tax", mode)}
              computed={taxAmount}
              ready={taxReady}
            />
            <AmountField
              label="Tip"
              state={tip}
              onInput={(input) => setTip((s) => ({ ...s, input }))}
              onModeChange={(mode) => toggleMode("tip", mode)}
              computed={tipAmount}
              ready={tipReady}
            />
          </div>
          {(!taxReady || !tipReady) && (
            <p className="text-[0.68rem] text-burnt mb-2 leading-snug">
              {!taxReady && !tipReady
                ? "Enter tax and tip (or 0 if none) to continue."
                : !taxReady
                  ? "Enter tax (or 0 if none) to continue."
                  : "Enter tip (or 0 if none) to continue."}
            </p>
          )}

          <div className="flex items-center justify-between py-3 border-t border-ink/10 mb-4">
            <span className="display text-lg uppercase text-ink">Total</span>
            <span className="mono display font-bold text-2xl text-burnt">{money(grandTotal)}</span>
          </div>

          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="btn-burnt w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding…" : "Use these items"}
          </button>
          <button onClick={onClose} className="btn-ghost w-full mt-3">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function amountFor(state: { mode: "$" | "%"; input: string }, subtotal: number): number {
  const n = Number(state.input);
  if (!Number.isFinite(n) || state.input.trim() === "") return 0;
  return state.mode === "%" ? subtotal * (n / 100) : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function AmountField({
  label,
  state,
  onInput,
  onModeChange,
  computed,
  ready,
}: {
  label: string;
  state: { mode: "$" | "%"; input: string };
  onInput: (v: string) => void;
  onModeChange: (mode: "$" | "%") => void;
  computed: number;
  ready: boolean;
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
            onClick={() => onModeChange("%")}
            className={`px-2 py-1 text-[0.7rem] font-bold ${state.mode === "%" ? "bg-ink text-paper" : "text-ink"}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => onModeChange("$")}
            className={`px-2 py-1 text-[0.7rem] font-bold ${state.mode === "$" ? "bg-ink text-paper" : "text-ink"}`}
          >
            $
          </button>
        </div>
      </div>
      <input
        type="number"
        step="0.01"
        min="0"
        value={state.input}
        onChange={(e) => onInput(e.target.value)}
        placeholder="0.00"
        className={`w-full min-w-0 mono ${!ready ? "border-burnt" : ""}`}
      />
      {state.mode === "%" && (
        <div className="text-[0.65rem] mono text-brown">= {money(computed)}</div>
      )}
    </div>
  );
}
