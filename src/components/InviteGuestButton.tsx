import { useMemo } from "react";

declare global {
  interface Window {
    Capacitor?: { getPlatform?: () => string };
  }
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof window !== "undefined" && window.Capacitor?.getPlatform) {
    const platform = window.Capacitor.getPlatform();
    if (platform === "ios" || platform === "android") return platform;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function buildMessage(claimUrl: string, guestName?: string): string {
  const greeting = guestName ? `Hey ${guestName}` : "Hey";
  return `${greeting} — you've got a charge waiting on The Tab. Claim it here: ${claimUrl}`;
}

function buildSmsHref(phoneNumber: string, message: string): string {
  const separator = detectPlatform() === "ios" ? "&" : "?";
  return `sms:${phoneNumber}${separator}body=${encodeURIComponent(message)}`;
}

function buildWhatsAppHref(phoneNumber: string, message: string): string {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function InviteGuestButton({
  phoneNumber,
  claimUrl,
  guestName,
}: {
  phoneNumber: string;
  claimUrl: string;
  guestName?: string;
}) {
  const message = useMemo(() => buildMessage(claimUrl, guestName), [claimUrl, guestName]);
  const smsHref = useMemo(() => buildSmsHref(phoneNumber, message), [phoneNumber, message]);
  const waHref = useMemo(() => buildWhatsAppHref(phoneNumber, message), [phoneNumber, message]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <a href={smsHref} className="stamp stamp-burnt flex-1 justify-center">
          Text
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="stamp stamp-solid flex-1 justify-center"
        >
          WhatsApp
        </a>
      </div>
      {/* Visible fallback: some Android messaging apps ignore the body= prefill. */}
      <p className="text-[0.68rem] text-brown leading-snug">{message}</p>
    </div>
  );
}
