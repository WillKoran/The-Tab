// Edge function: scan-receipt
//
// Receives a receipt photo from the client, sends it to Gemini (Flash-Lite)
// for OCR/extraction, and returns strict, defensively-parsed JSON. Runs
// server-side so the Gemini API key never ships in the app bundle.
//
// Requires the GEMINI_API_KEY secret (see README note below / project docs).
// Deploy: npx supabase functions deploy scan-receipt
// Set key: npx supabase secrets set GEMINI_API_KEY=your_key_here

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 25_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT = `You are an expert at reading restaurant and retail receipts from photos.

Extract data from the receipt image and respond with ONLY a single JSON object (no markdown fences, no commentary) matching this shape:

{
  "merchant": string or null,
  "date": string or null,
  "items": [{ "name": string, "price": number, "quantity": number }],
  "subtotal": number or null,
  "tax": number or null,
  "tip": number or null,
  "total": number or null
}

Rules:
- "price" for each item is the line's total printed price (already accounting for quantity if that's how the receipt prints it) — read the printed digits, don't invent a per-unit price.
- "quantity" defaults to 1 if the receipt doesn't print one.
- CRITICAL: "tax" and "tip" must be null unless a tax amount or a tip/gratuity amount is EXPLICITLY printed as its own line on the receipt. Never calculate, estimate, or guess a tax or tip value — leave it null if it isn't printed.
- "subtotal" and "total" should also be null if not printed, rather than computed by you.
- For item prices, use your best reading of the printed digits. For tax/tip specifically, when in doubt, prefer null over a guess.
- Respond with raw JSON only.`;

const RECEIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          price: { type: "NUMBER" },
          quantity: { type: "NUMBER" },
        },
        required: ["name", "price"],
      },
    },
    subtotal: { type: "NUMBER", nullable: true },
    tax: { type: "NUMBER", nullable: true },
    tip: { type: "NUMBER", nullable: true },
    total: { type: "NUMBER", nullable: true },
  },
  required: ["items"],
};

interface ScannedItem {
  name: string;
  price: number;
  quantity: number;
}
interface ScannedReceipt {
  merchant: string | null;
  date: string | null;
  items: ScannedItem[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// Defensive parse: responseSchema constrains Gemini's output, but we still
// validate shape ourselves rather than trusting it blindly.
function normalizeReceipt(data: unknown): ScannedReceipt | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.items)) return null;

  const items: ScannedItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const price = toNumber(r.price);
    if (!name || price === null) continue;
    const quantity = toNumber(r.quantity);
    items.push({ name, price, quantity: quantity && quantity > 0 ? Math.round(quantity) : 1 });
  }

  return {
    merchant: typeof d.merchant === "string" && d.merchant.trim() ? d.merchant.trim() : null,
    date: typeof d.date === "string" && d.date.trim() ? d.date.trim() : null,
    items,
    subtotal: toNumber(d.subtotal),
    tax: toNumber(d.tax),
    tip: toNumber(d.tip),
    total: toNumber(d.total),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!GEMINI_API_KEY) {
    console.error("scan-receipt: GEMINI_API_KEY is not set");
    return json({ error: "Receipt scanning isn't configured on the server yet." }, 500);
  }

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const image = body.image;
  if (typeof image !== "string" || !image) {
    return json({ error: "Missing image" }, 400);
  }
  const mimeType =
    typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
      ? body.mimeType
      : "image/jpeg";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RECEIPT_SCHEMA,
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    console.error("scan-receipt: fetch to Gemini failed", err);
    return json(
      { error: timedOut ? "Receipt scan timed out. Try again." : "Couldn't reach the OCR service." },
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => "");
    console.error("scan-receipt: Gemini API error", geminiRes.status, detail.slice(0, 1000));
    const status = geminiRes.status === 429 ? 429 : 502;
    return json(
      { error: status === 429 ? "OCR service is busy, try again in a moment." : "OCR service error." },
      status,
    );
  }

  const payload = await geminiRes.json().catch(() => null);
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    const finishReason = payload?.candidates?.[0]?.finishReason;
    console.error(
      "scan-receipt: unexpected Gemini response shape",
      finishReason,
      JSON.stringify(payload).slice(0, 1000),
    );
    return json({ error: "Couldn't read a response from the OCR service." }, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("scan-receipt: Gemini returned non-JSON text", text.slice(0, 1000));
    return json({ error: "Couldn't parse the receipt. Try a clearer photo or enter items manually." }, 502);
  }

  const receipt = normalizeReceipt(parsed);
  if (!receipt) {
    console.error("scan-receipt: normalized receipt failed validation", text.slice(0, 1000));
    return json({ error: "Couldn't read items off that receipt. Try a clearer photo or enter items manually." }, 502);
  }

  return json({ receipt });
});
