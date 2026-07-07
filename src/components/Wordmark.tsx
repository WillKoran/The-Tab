export function Wordmark({ tone = "light" }: { tone?: "light" | "dark" }) {
  const fg = tone === "light" ? "text-paper" : "text-ink";
  return (
    <div className="leading-none">
      <div className={`text-[0.7rem] tracking-[0.35em] font-semibold ${fg}`}>THE</div>
      <div className={`display font-bold text-[3rem] leading-[0.85] ${fg}`}>TAB</div>
      <div className="h-[3px] w-8 bg-burnt mt-1" />
    </div>
  );
}
