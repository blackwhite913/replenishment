"use client"

import { Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FiltersProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  minDaysCover: number
  onMinDaysCoverChange: (value: number) => void
}

export function Filters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  minDaysCover,
  onMinDaysCoverChange,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
      <div className="flex items-center gap-2 text-muted-foreground mb-0 sm:mb-0">
        <SlidersHorizontal className="size-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
      </div>

      <div className="flex-1 max-w-xs">
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Search SKU
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="e.g. SKU-1001 or Headphones"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 pl-8 text-sm bg-secondary border-border placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="w-44">
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </label>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="h-8 w-full text-sm bg-secondary border-border">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="healthy">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400" />
                Healthy
              </span>
            </SelectItem>
            <SelectItem value="monitor">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-400" />
                Monitor
              </span>
            </SelectItem>
            <SelectItem value="replenish">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-red-400" />
                Replenish Now
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-56">
        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Min Days Cover: <span className="text-foreground font-bold">{minDaysCover}</span>
        </label>
        <Slider
          value={[minDaysCover]}
          onValueChange={(val) => onMinDaysCoverChange(val[0])}
          min={0}
          max={30}
          step={1}
          className="py-2"
        />
      </div>
    </div>
  )
}
