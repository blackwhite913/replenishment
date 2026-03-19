"use client"

import { Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
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
  productTypeFilter?: string
  onProductTypeFilterChange?: (value: string) => void
  demandTypeFilter?: string
  onDemandTypeFilterChange?: (value: string) => void
}

export function Filters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  productTypeFilter,
  onProductTypeFilterChange,
  demandTypeFilter,
  onDemandTypeFilterChange,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:flex-wrap">
      <div className="flex items-center gap-2 text-muted-foreground mb-0 sm:mb-0">
        <SlidersHorizontal className="size-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
      </div>

      <div className="flex-1 max-w-xs min-w-[160px]">
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

      <div className="w-40">
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
            <SelectItem value="monitoring">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-400" />
                Monitoring
              </span>
            </SelectItem>
            <SelectItem value="oosRisk">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-red-400" />
                OOS Risk
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {onProductTypeFilterChange && (
        <div className="w-40">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Product Type
          </label>
          <Select
            value={productTypeFilter ?? "all"}
            onValueChange={onProductTypeFilterChange}
          >
            <SelectTrigger className="h-8 w-full text-sm bg-secondary border-border">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="standard">Standard Only</SelectItem>
              <SelectItem value="component">Components Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {onDemandTypeFilterChange && (
        <div className="w-40">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Demand Type
          </label>
          <Select
            value={demandTypeFilter ?? "all"}
            onValueChange={onDemandTypeFilterChange}
          >
            <SelectTrigger className="h-8 w-full text-sm bg-secondary border-border">
              <SelectValue placeholder="All Demand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Demand</SelectItem>
              <SelectItem value="SALES_ONLY">Sales Only</SelectItem>
              <SelectItem value="ASM_ONLY">Assembly Only</SelectItem>
              <SelectItem value="HYBRID">Hybrid</SelectItem>
              <SelectItem value="NO_DEMAND">No Demand</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
