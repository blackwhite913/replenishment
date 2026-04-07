"use client"

import { Input } from "@/components/ui/input"
import { MobileNav } from "@/components/dashboard/mobile-nav"

interface TopNavProps {
  leadTime: number
  onLeadTimeChange: (value: number) => void
}

export function TopNav({
  leadTime,
  onLeadTimeChange,
}: TopNavProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex flex-col gap-4 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <MobileNav />
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              stock-ly Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              stock-ly Inventory Replenishment
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Lead Time
            </span>
            <Input
              type="number"
              min={1}
              max={30}
              value={leadTime}
              onChange={(e) => onLeadTimeChange(Number(e.target.value))}
              className="w-12 h-6 border-0 bg-muted text-center text-xs font-mono font-semibold text-foreground p-0"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>
      </div>
    </header>
  )
}
