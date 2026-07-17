import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface ScannedReceiptItem {
  name: string;
  price: number;
  quantity: number;
}
export interface ScannedReceipt {
  merchant: string | null;
  date: string | null;
  items: ScannedReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

const SCAN_TIMEOUT_MS = 35_000;

// Sends a receipt photo to the scan-receipt edge function (which calls
// Gemini server-side) and returns the extracted, review-ready receipt.
// Throws with a user-facing message on any failure — callers should show it
// and offer retry / manual entry.
export async function scanReceipt(file: File): Promise<ScannedReceipt> {
  const image = await fileToBase64(file);

  const invokePromise = supabase.functions.invoke<{ receipt?: ScannedReceipt; error?: string }>(
    "scan-receipt",
    { body: { image, mimeType: file.type || "image/jpeg" } },
  );
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("Receipt scan timed out. Check your connection and try again.")),
      SCAN_TIMEOUT_MS,
    );
  });

  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

  if (error) {
    let message = error.message || "Receipt scan failed.";
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // response body wasn't JSON — fall back to the generic message above
      }
    }
    throw new Error(message);
  }
  if (!data || data.error || !data.receipt) {
    throw new Error(data?.error || "Receipt scan failed.");
  }
  return data.receipt;
}
