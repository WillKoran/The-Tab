import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/integrations/supabase/client";

export interface GuestIdentity {
  id: string;
  phone_number: string;
  display_name: string | null;
  auth_user_id: string | null;
  created_at: string;
}

export function normalizePhoneNumber(
  phoneNumber: string,
  defaultCountry: CountryCode = "US",
): string {
  const parsed = parsePhoneNumberWithError(phoneNumber, defaultCountry);
  if (!parsed.isValid()) throw new Error(`"${phoneNumber}" isn't a valid phone number`);
  return parsed.number;
}

// Upserts a guest identity by phone number: returns the existing identity
// unchanged if the number is already known, otherwise creates a new
// (unclaimed) one. Never creates a duplicate row for the same phone number,
// regardless of how the input was formatted.
export async function upsertGuestUser(
  phoneNumber: string,
  displayName?: string,
): Promise<GuestIdentity> {
  const normalized = normalizePhoneNumber(phoneNumber);
  const { data, error } = await supabase.rpc("upsert_guest_identity", {
    p_phone_number: normalized,
    p_display_name: displayName ?? null,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("upsert_guest_identity returned no row");
  return row;
}
