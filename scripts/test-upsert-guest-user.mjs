// Manual verification for upsertGuestUser: calling it twice for the same
// phone number -- even typed in different formats -- must return the same
// guest identity id, never a duplicate row.
//
// Run: node --env-file=.env.local scripts/test-upsert-guest-user.mjs
import { createClient } from "@supabase/supabase-js";
import { parsePhoneNumberWithError } from "libphonenumber-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected in .env.local)");
  process.exit(1);
}

// Mirrors the opaque-key handling in src/integrations/supabase/client.server.ts:
// new-style sb_secret_* keys are not bearer JWTs, so drop the Authorization header.
function createSupabaseFetch(key) {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY) },
});

function normalizePhoneNumber(phoneNumber, defaultCountry = "US") {
  const parsed = parsePhoneNumberWithError(phoneNumber, defaultCountry);
  if (!parsed.isValid()) throw new Error(`"${phoneNumber}" isn't a valid phone number`);
  return parsed.number;
}

async function upsertGuestUser(phoneNumber, displayName) {
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

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  // 555-01XX in a real area code is the NANP block reserved for fictional
  // use, so it's syntactically valid (passes libphonenumber-js) without
  // being a real subscriber number. Randomized per run to avoid collisions.
  const areaCode = "212";
  const mid = "555";
  const last = `01${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
  const e164 = `+1${areaCode}${mid}${last}`;
  const dashed = `${areaCode}-${mid}-${last}`;
  const parens = `(${areaCode}) ${mid}-${last}`;

  const createdIds = [];
  try {
    const first = await upsertGuestUser(e164, "Alex");
    createdIds.push(first.id);
    assert(first.display_name === "Alex", "first call creates the guest with the given display name");

    const second = await upsertGuestUser(dashed, "Someone Else");
    createdIds.push(second.id);
    assert(second.id === first.id, "same number in dashed format returns the same id");
    assert(second.display_name === "Alex", "second call does not overwrite the existing display name");

    const third = await upsertGuestUser(parens);
    createdIds.push(third.id);
    assert(third.id === first.id, "same number in parens format returns the same id");

    const otherNumber = `+1312${mid}01${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
    const other = await upsertGuestUser(otherNumber, "Someone Different");
    createdIds.push(other.id);
    assert(other.id !== first.id, "a genuinely different phone number gets a different id");

    console.log("\nAll checks passed.");
  } finally {
    const ids = [...new Set(createdIds)];
    if (ids.length) await supabase.from("guest_identities").delete().in("id", ids);
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
