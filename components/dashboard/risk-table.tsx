"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowUpRight } from "lucide-react"
import type { SkuItem } from "@/lib/placeholder-data"

interface RiskTableProps {
  data: SkuItem[]
  onRowClick: (sku: SkuItem) => void
}

function StatusBadge({ status }: { status: SkuItem["status"] }) {
  const config = {
    healthy: {
      label: "Healthy",
      dot: "bg-emerald-400",
      classes: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    },
    monitor: {
      label: "Monitor",
      dot: "bg-amber-400",
      classes: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    },
    replenish: {
      label: "Replenish",
      dot: "bg-red-400",
      classes: "bg-red-400/10 text-red-400 border-red-400/20",
    },
  }

  const { label, dot, classes } = config[status]

  return (
    <Badge variant="outline" className={`gap-1.5 font-medium ${classes}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </Badge>
  )
}

function DaysCoverBar({ value, max = 25 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  const color =
    value < 2 ? "bg-red-400" : value < 5 ? "bg-amber-400" : "bg-emerald-400"

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs font-mono font-semibold tabular-nums ${
          value < 2
            ? "text-red-400"
            : value < 5
              ? "text-amber-400"
              : "text-foreground"
        }`}
      >
        {value.toFixed(1)}
      </span>
    </div>
  )
}

export function RiskTable({ data, onRowClick }: RiskTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-340px)] min-h-[200px]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card border-b border-border">
            <TableRow className="border-b-0 bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                SKU
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Product
              </TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Shop Stock
              </TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Daily Sales
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Days Cover
              </TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Reorder Pt
              </TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                3PL Stock
              </TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Transfer Qty
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-24 text-center text-muted-foreground"
                >
                  No SKUs match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow
                  key={item.sku}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/30"
                  onClick={() => onRowClick(item)}
                >
                  <TableCell className="font-mono text-xs font-bold text-primary">
                    {item.sku}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-foreground">
                    {item.productName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium text-foreground">
                    {item.shopStock.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {item.dailySales.toLocaleString()}/day
                  </TableCell>
                  <TableCell>
                    <DaysCoverBar value={item.daysCover} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {item.reorderPoint.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {item.thirdPlStock === 0 ? (
                      <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-xs font-bold text-red-400">
                        OUT
                      </span>
                    ) : (
                      <span className="text-foreground">
                        {item.thirdPlStock.toLocaleString()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {item.suggestedTransferQty > 0 ? (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                        {item.suggestedTransferQty.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
