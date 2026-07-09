export interface Guest {
  id: string;
  name: string;
  is_you: boolean;
  venmo_handle?: string | null;
  user_id?: string | null;
  claim_token?: string;
  phone_number?: string | null;
}
export interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  guest_ids: string[];
}

export interface Totals {
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  grandTotal: number;
  perGuestSubtotal: Record<string, number>;
  perGuestTotal: Record<string, number>;
}

export function computeTotals(
  items: Item[],
  guests: Guest[],
  tax: { value: number; isPercent: boolean },
  tip: { value: number; isPercent: boolean },
): Totals {
  const perGuestSubtotal: Record<string, number> = {};
  guests.forEach((g) => {
    perGuestSubtotal[g.id] = 0;
  });

  let subtotal = 0;
  for (const item of items) {
    const line = Number(item.price) * Number(item.quantity || 1);
    subtotal += line;
    const assigned = item.guest_ids.filter((id) => perGuestSubtotal[id] !== undefined);
    if (assigned.length === 0) continue;
    const share = line / assigned.length;
    for (const gid of assigned) perGuestSubtotal[gid] += share;
  }

  const taxAmount = tax.isPercent ? subtotal * (Number(tax.value) / 100) : Number(tax.value);
  const tipAmount = tip.isPercent ? subtotal * (Number(tip.value) / 100) : Number(tip.value);
  const grandTotal = subtotal + taxAmount + tipAmount;

  const perGuestTotal: Record<string, number> = {};
  for (const g of guests) {
    const sub = perGuestSubtotal[g.id] ?? 0;
    const ratio = subtotal > 0 ? sub / subtotal : 0;
    perGuestTotal[g.id] = sub + ratio * taxAmount + ratio * tipAmount;
  }

  return { subtotal, taxAmount, tipAmount, grandTotal, perGuestSubtotal, perGuestTotal };
}

export function money(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

export function venmoDeepLink(handle: string, amount: number, note: string): string {
  const h = handle.replace(/^@/, "");
  const params = new URLSearchParams({
    txn: "pay",
    audience: "private",
    amount: (Math.round(amount * 100) / 100).toFixed(2),
    note,
    recipients: h,
  });
  return `venmo://paycharge?${params.toString()}`;
}
