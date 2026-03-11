"use client"

import { RefreshCw, Search, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface TopNavProps {
  channel: string
  onChannelChange: (channel: string) => void
  leadTime: number
  onLeadTimeChange: (value: number) => void
  onRefresh: () => void
}

export function TopNav({
  channel,
  onChannelChange,
  leadTime,
  onLeadTimeChange,
  onRefresh,
}: TopNavProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex flex-col gap-4 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            Replenishment monitoring across all channels
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={channel} onValueChange={onChannelChange}>
            <TabsList className="bg-secondary">
              <TabsTrigger
                value="shop"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Shop
              </TabsTrigger>
              <TabsTrigger
                value="corporate"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Corporate
              </TabsTrigger>
            </TabsList>
          </Tabs>

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

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <Search className="size-4" />
              <span className="sr-only">Search</span>
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
              >
                <Bell className="size-4" />
                <span className="sr-only">Notifications</span>
              </Button>
              <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-foreground">
                3
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="size-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
