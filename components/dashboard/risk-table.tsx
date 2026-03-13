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
    monitoring: {
      label: "Monitoring",
      dot: "bg-amber-400",
      classes: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    },
    oosRisk: {
      label: "OOS Risk",
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

function DaysCoverValue({
  value,
  status,
}: {
  value: number
  status: SkuItem["status"]
}) {
  const colorClass =
    status === "healthy"
      ? "text-emerald-400"
      : status === "monitoring"
        ? "text-amber-400"
        : "text-red-400"

  return (
    <span
      className={`text-xs font-mono font-semibold tabular-nums ${colorClass}`}
    >
      {Math.floor(value).toLocaleString()}
    </span>
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
                  colSpan={9}
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
                    <DaysCoverValue value={item.daysCover} status={item.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {item.reorderPoint.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-foreground">
                    {item.thirdPlStock.toLocaleString()}
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
