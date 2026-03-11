"use client"

import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Truck,
  BarChart3,
  Settings,
  HelpCircle,
  Bell,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const navItems = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: Package, label: "Inventory" },
  { icon: TrendingUp, label: "Forecasting" },
  { icon: Truck, label: "Transfers" },
  { icon: BarChart3, label: "Reports" },
  { icon: Bell, label: "Alerts" },
]

const bottomItems = [
  { icon: HelpCircle, label: "Help Center" },
  { icon: Settings, label: "Settings" },
]

export function Sidebar() {
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
          StockPilot
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    item.active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.active && (
                    <span className="ml-auto size-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex flex-col gap-0.5">
          {bottomItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

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
