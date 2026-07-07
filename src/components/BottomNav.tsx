import { Link, useRouterState } from "@tanstack/react-router";
import { Receipt, Users, User } from "lucide-react";

export function BottomNav() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const items = [
    { to: "/home", label: "Checks", Icon: Receipt },
    { to: "/regulars", label: "Regulars", Icon: Users },
    { to: "/account", label: "Account", Icon: User },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-ink text-paper border-t border-ink">
      <div className="max-w-md mx-auto grid grid-cols-3">
        {items.map(({ to, label, Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-3 text-[0.62rem] tracking-[0.24em] uppercase font-bold ${active ? "text-burnt" : "text-paper/70"}`}
            >
              <Icon size={18} strokeWidth={2.2} />
              {label}
            </Link>
          );
        })}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
