"use client"

import { useMemo, useEffect, useState } from "react"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowRight, TrendingUp, Package, BarChart3, Truck, Target } from "lucide-react"
import type { SkuItem } from "@/lib/placeholder-data"
import {
  generateStockLevels,
  transferHistory,
} from "@/lib/placeholder-data"
import {
  computeDailySales,
  computeDaysCover,
  computeReorderPoint,
} from "@/lib/forecasting"
import { Spinner } from "@/components/ui/spinner"

interface DetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSku: SkuItem | null
  leadTime?: number
}

const customTooltipStyle = {
  backgroundColor: "#1a1d24",
  border: "1px solid #2a2e37",
  borderRadius: "8px",
  fontSize: "11px",
  color: "#e8eaed",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
}

function formatDateForAxis(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function DetailPanel({
  open,
  onOpenChange,
  selectedSku,
  leadTime = 3,
}: DetailPanelProps) {
  const stockLevels = useMemo(() => generateStockLevels(), [])

  const [skuSalesTrend, setSkuSalesTrend] = useState<{
    last90Days: { date: string; units: number }[]
    total90Days: number
  } | null>(null)
  const [skuSalesLoading, setSkuSalesLoading] = useState(false)
  const [skuSalesError, setSkuSalesError] = useState(false)

  useEffect(() => {
    if (!open || !selectedSku?.sku) {
      setSkuSalesTrend(null)
      return
    }
    setSkuSalesLoading(true)
    setSkuSalesError(false)
    fetch(`/api/unleashed/sales-trend?sku=${encodeURIComponent(selectedSku.sku)}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body?.detail || "Failed to fetch")
        setSkuSalesTrend({
          last90Days: body.last90Days ?? [],
          total90Days: body.total90Days ?? 0,
        })
      })
      .catch(() => setSkuSalesError(true))
      .finally(() => setSkuSalesLoading(false))
  }, [open, selectedSku?.sku])

  if (!selectedSku) return null

  const statusConfig = {
    healthy: { label: "Healthy", dot: "bg-emerald-400", bg: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
    monitoring: { label: "Monitoring", dot: "bg-amber-400", bg: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
    oosRisk: { label: "OOS Risk", dot: "bg-red-400", bg: "bg-red-400/10 text-red-400 border-red-400/20" },
  }

  const status = statusConfig[selectedSku.status]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl bg-background border-border"
      >
        <SheetHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15">
              <Package className="size-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <span className="font-mono text-sm font-bold">{selectedSku.sku}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${status.bg}`}>
                  <span className={`size-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-muted-foreground">{selectedSku.productName}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {/* Quick stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Package}
              label="Shop Stock"
              value={selectedSku.shopStock}
              color="text-emerald-400"
              bg="bg-emerald-400/10"
            />
            <StatCard
              icon={TrendingUp}
              label="Daily Sales (90d avg)"
              value={
                skuSalesTrend
                  ? computeDailySales(skuSalesTrend.total90Days)
                  : skuSalesLoading
                    ? "..."
                    : selectedSku.dailySales
              }
              color="text-blue-400"
              bg="bg-blue-400/10"
            />
            <StatCard
              icon={BarChart3}
              label="Days Cover"
              value={
                skuSalesTrend
                  ? computeDaysCover(
                      selectedSku.shopStock,
                      computeDailySales(skuSalesTrend.total90Days)
                    )
                  : skuSalesLoading
                    ? "..."
                    : selectedSku.daysCover
              }
              color="text-amber-400"
              bg="bg-amber-400/10"
            />
            <StatCard
              icon={Truck}
              label="3PL Stock"
              value={selectedSku.thirdPlStock}
              color="text-purple-400"
              bg="bg-purple-400/10"
            />
            <StatCard
              icon={Target}
              label="Reorder Point"
              value={
                skuSalesTrend
                  ? computeReorderPoint(
                      computeDailySales(skuSalesTrend.total90Days),
                      leadTime
                    )
                  : skuSalesLoading
                    ? "..."
                    : selectedSku.reorderPoint
              }
              color="text-cyan-400"
              bg="bg-cyan-400/10"
            />
          </div>

          <Separator className="bg-border" />

          {/* Sales trend chart - per-SKU 90-day */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">
                90-Day Sales Trend
              </h3>
              <span className="text-[10px] rounded-md bg-secondary px-2 py-0.5 text-muted-foreground font-medium">
                {skuSalesTrend ? `${skuSalesTrend.total90Days} units (90 days)` : "Last 90 days"}
              </span>
            </div>
            <div className="h-44 w-full">
              {skuSalesLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Spinner className="size-8 text-primary/70" />
                </div>
              ) : skuSalesError ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Failed to load sales data
                </div>
              ) : skuSalesTrend?.last90Days?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={skuSalesTrend.last90Days.map((p) => ({
                      ...p,
                      displayDate: formatDateForAxis(p.date),
                    }))}
                  >
                    <defs>
                      <linearGradient id="salesGradientDetail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
                    <XAxis
                      dataKey="displayDate"
                      tick={{ fontSize: 9, fill: "#8b919a" }}
                      interval={Math.floor(skuSalesTrend.last90Days.length / 6)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#8b919a" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="units"
                      stroke="#34d399"
                      strokeWidth={2}
                      fill="url(#salesGradientDetail)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No sales data for this SKU
                </div>
              )}
            </div>
          </div>

          {/* Stock levels chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">
                Stock Levels
              </h3>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="size-2 rounded-full bg-blue-400" />
                  Shop
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="size-2 rounded-full bg-purple-400" />
                  3PL
                </span>
              </div>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockLevels}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#8b919a" }}
                    interval={6}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#8b919a" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="shop"
                    name="Shop"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="thirdPl"
                    name="3PL"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Transfer history */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">
                Transfer History
              </h3>
              <span className="text-[10px] rounded-md bg-secondary px-2 py-0.5 text-muted-foreground font-medium">
                {transferHistory.length} records
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-secondary/30 hover:bg-secondary/30">
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Route
                  </TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Qty
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferHistory.map((record, i) => (
                  <TableRow key={i} className="border-b border-border/50">
                    <TableCell className="text-xs text-muted-foreground">
                      {record.date}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{record.from}</span>
                        <ArrowRight className="size-3 text-primary" />
                        <span>{record.to}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
                        +{record.qty}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`size-4 ${color}`} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-bold tabular-nums text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  )
}
