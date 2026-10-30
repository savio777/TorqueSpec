"use client";

import { Bike, FileText, LayoutDashboard, LogOut, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/motorcycles", label: "Modelos de Motos", Icon: Bike },
  { href: "/manuals", label: "Manuais (PDF)", Icon: FileText },
  { href: "/chat", label: "Chat RAG", Icon: MessagesSquare },
];

export function Sidebar() {
  const pathname = usePathname();
  const { state, logout } = useAuth();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex shrink-0 flex-col border-border bg-surface md:sticky md:top-0 md:h-dvh md:w-64 md:border-r">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo />
        <button type="button" onClick={logout} aria-label="Sair" className="rounded-lg p-2 text-muted hover:text-fg md:hidden">
          <LogOut aria-hidden className="size-4" />
        </button>
      </div>
      <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              isActive(href) ? "bg-brand-solid text-white" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      {state.user && (
        <div className="hidden border-t border-border px-5 py-4 md:block">
          <p className="truncate text-sm font-medium">{state.user.name}</p>
          <p className="truncate text-xs text-muted">{state.user.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-3 inline-flex items-center gap-2 text-xs text-muted hover:text-fg"
          >
            <LogOut aria-hidden className="size-3.5" /> Sair
          </button>
        </div>
      )}
    </aside>
  );
}
