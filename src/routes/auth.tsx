import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type Method = "email" | "phone";

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [method, setMethod] = useState<Method>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const creds = method === "email" ? { email, password } : { phone, password };
    const { error } = await supabase.auth.signInWithPassword(creds as any);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    nav({ to: "/home" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter your name");
    setLoading(true);
    const options = { data: { name }, emailRedirectTo: `${window.location.origin}/auth` };
    const payload: any = method === "email"
      ? { email, password, options }
      : { phone, password, options };
    const { data, error } = await supabase.auth.signUp(payload);
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Account created");
      nav({ to: "/onboarding" });
    } else {
      toast.success("Check your inbox to confirm your account");
      setMode("signin");
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Check your email for a reset link");
    setMode("signin");
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="bg-ink text-paper px-6 py-8 mb-6 flex items-end justify-between">
          <Wordmark tone="light" />
          <div className="text-right">
            <div className="text-[0.62rem] tracking-[0.24em] text-burnt font-bold">CHECK,</div>
            <div className="text-[0.62rem] tracking-[0.24em] text-paper/70">PLEASE</div>
          </div>
        </div>

        <div className="paper-fold px-6 py-7">
          <span className="fold-crease" />

          <div className="flex items-center justify-between mb-5">
            <h1 className="display text-2xl uppercase text-ink">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Open account" : "Reset password"}
            </h1>
            <div className="text-[0.62rem] tracking-[0.2em] text-brown uppercase mono">no. 001</div>
          </div>

          {mode !== "forgot" && (
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setMethod("email")}
                className={`flex-1 py-2 text-[0.7rem] tracking-[0.22em] uppercase font-bold border ${method === "email" ? "bg-ink text-paper border-ink" : "bg-transparent text-ink border-ink/30"}`}
              >Email</button>
              <button
                type="button"
                onClick={() => setMethod("phone")}
                className={`flex-1 py-2 text-[0.7rem] tracking-[0.22em] uppercase font-bold border ${method === "phone" ? "bg-ink text-paper border-ink" : "bg-transparent text-ink border-ink/30"}`}
              >Phone</button>
            </div>
          )}

          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-3">
              {method === "email" ? (
                <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
              ) : (
                <Field label="Phone (with country code)"><input type="tel" required placeholder="+15551234567" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
              )}
              <Field label="Password"><input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
              <button className="btn-burnt w-full mt-2" disabled={loading}>{loading ? "…" : "Sign in"}</button>
              <div className="flex justify-between pt-2 text-[0.72rem] tracking-[0.16em] uppercase font-semibold">
                <button type="button" onClick={() => setMode("forgot")} className="text-brown hover:text-ink">Forgot?</button>
                <button type="button" onClick={() => setMode("signup")} className="text-ink hover:text-burnt">Create account →</button>
              </div>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <Field label="Your name"><input type="text" required value={name} onChange={e => setName(e.target.value)} /></Field>
              {method === "email" ? (
                <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
              ) : (
                <Field label="Phone (with country code)"><input type="tel" required placeholder="+15551234567" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
              )}
              <Field label="Password"><input type="password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></Field>
              <button className="btn-burnt w-full mt-2" disabled={loading}>{loading ? "…" : "Open my tab"}</button>
              <div className="flex justify-center pt-2 text-[0.72rem] tracking-[0.16em] uppercase font-semibold">
                <button type="button" onClick={() => setMode("signin")} className="text-ink hover:text-burnt">← Back to sign in</button>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-3">
              <p className="text-sm text-brown mb-2">Enter your email and we'll send a reset link.</p>
              <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
              <button className="btn-ink w-full mt-2" disabled={loading}>{loading ? "…" : "Send reset link"}</button>
              <div className="flex justify-center pt-2 text-[0.72rem] tracking-[0.16em] uppercase font-semibold">
                <button type="button" onClick={() => setMode("signin")} className="text-ink hover:text-burnt">← Back</button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-[0.7rem] tracking-[0.2em] text-brown uppercase mt-6">
          Split fairly. <span className="script normal-case tracking-normal text-burnt text-lg">settle sweetly.</span>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[0.62rem] tracking-[0.22em] uppercase font-bold text-brown mb-1">{label}</div>
      {children}
    </label>
  );
}
