"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  TrendingUp,
  Truck,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const navItems = [
  { icon: LayoutDashboard, label: "Inventory Risk", href: "/", pathMatch: "/" },
  { icon: TrendingUp, label: "Forecasting", href: "/forecasting", pathMatch: "/forecasting" },
  { icon: Truck, label: "Transfers", href: "/", pathMatch: "/transfers" },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden lg:flex flex-col w-[220px] shrink-0 border-r border-border bg-sidebar min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <svg
            className="size-4 text-primary-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <span className="text-sm font-bold tracking-tight text-foreground">
          NAB Pilot
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive =
              item.pathMatch === "/"
                ? pathname === "/"
                : pathname.startsWith(item.pathMatch)
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto size-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-border px-3 py-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            OP
          </div>
          <div className="flex-1 text-left">
            <p className="text-xs font-medium text-foreground">Ops Manager</p>
            <p className="text-[10px] text-muted-foreground">Admin</p>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </div>
    </aside>
  )
}
