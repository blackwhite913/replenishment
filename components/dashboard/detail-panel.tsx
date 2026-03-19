"use client"

import { useMemo, useEffect, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
import {
  TrendingUp,
  Package,
  BarChart3,
  Truck,
  Target,
  Layers,
  ShoppingCart,
  Cog,
} from "lucide-react"
import type { SkuItem } from "@/lib/placeholder-data"
import {
  computeDailySales,
  computeDaysCover,
  computeReorderPoint,
} from "@/lib/forecasting"
import type { BomDetail } from "@/lib/inventory-risk"
import { Spinner } from "@/components/ui/spinner"

interface DetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSku: SkuItem | null
  leadTime?: number
  demandTrendOverrideBySku?: Record<
    string,
    { last90Days: { date: string; units: number }[]; total90Days: number }
  >
  demandTrendTitle?: string
  bomVisibilityMap?: Map<string, BomDetail[]>
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
  demandTrendOverrideBySku,
  demandTrendTitle = "90-Day Demand Trend",
  bomVisibilityMap,
}: DetailPanelProps) {
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
    const override = demandTrendOverrideBySku?.[selectedSku.sku]
    if (override) {
      setSkuSalesTrend({
        last90Days: override.last90Days ?? [],
        total90Days: override.total90Days ?? 0,
      })
      setSkuSalesError(false)
      setSkuSalesLoading(false)
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
  }, [open, selectedSku?.sku, demandTrendOverrideBySku])

  const bomDetails = useMemo(() => {
    if (!selectedSku?.sku || !bomVisibilityMap) return []
    return bomVisibilityMap.get(selectedSku.sku) ?? []
  }, [selectedSku?.sku, bomVisibilityMap])

  if (!selectedSku) return null

  const statusConfig = {
    healthy: { label: "Healthy", dot: "bg-emerald-400", bg: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
    monitoring: { label: "Monitoring", dot: "bg-amber-400", bg: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
    oosRisk: { label: "OOS Risk", dot: "bg-red-400", bg: "bg-red-400/10 text-red-400 border-red-400/20" },
  }

  const status = statusConfig[selectedSku.status]

  const demandTypeLabel: Record<string, string> = {
    SALES_ONLY: "Sales Only",
    ASM_ONLY: "Assembly Only",
    HYBRID: "Hybrid (SS + ASM)",
    NO_DEMAND: "No Demand",
  }

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
                {selectedSku.isComponent && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-semibold bg-violet-400/10 text-violet-400 border-violet-400/20"
                  >
                    Component
                  </Badge>
                )}
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
              label="Daily Demand (90d avg)"
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

          {/* Demand breakdown */}
          {(selectedSku.salesDemand !== undefined ||
            selectedSku.assemblyDemand !== undefined) && (
            <>
              <Separator className="bg-border" />
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-bold text-foreground mb-3">
                  Demand Breakdown (90 days)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat
                    icon={ShoppingCart}
                    label="Sales (SS)"
                    value={(selectedSku.salesDemand ?? 0).toLocaleString()}
                    color="text-blue-400"
                  />
                  <MiniStat
                    icon={Cog}
                    label="Assembly (ASM)"
                    value={(selectedSku.assemblyDemand ?? 0).toLocaleString()}
                    color="text-purple-400"
                  />
                  <MiniStat
                    icon={Layers}
                    label="Total"
                    value={(selectedSku.totalDemand ?? 0).toLocaleString()}
                    color="text-cyan-400"
                  />
                </div>
                {selectedSku.demandType && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Type:{" "}
                    <span className="font-semibold text-foreground">
                      {demandTypeLabel[selectedSku.demandType] ?? selectedSku.demandType}
                    </span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* BOM drill-down */}
          {bomDetails.length > 0 && (
            <>
              <Separator className="bg-border" />
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground">
                    Used in BOMs
                  </h3>
                  <span className="text-[10px] rounded-md bg-violet-400/10 px-2 py-0.5 text-violet-400 font-medium">
                    {bomDetails.length} BOM{bomDetails.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-secondary/30 hover:bg-secondary/30">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Parent SKU
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Parent Name
                      </TableHead>
                      <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Qty / Assembly
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomDetails.map((bom) => (
                      <TableRow key={bom.parentSku} className="border-b border-border/50">
                        <TableCell className="font-mono text-xs font-bold text-primary">
                          {bom.parentSku}
                        </TableCell>
                        <TableCell className="text-xs text-foreground max-w-[180px] truncate">
                          {bom.parentName}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="rounded bg-violet-400/10 px-2 py-0.5 text-xs font-bold tabular-nums text-violet-400">
                            {bom.qtyPerAssembly}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <Separator className="bg-border" />

          {/* Demand trend chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">
                {demandTrendTitle}
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
                  Failed to load demand data
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
                  No demand data for this SKU
                </div>
              )}
            </div>
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

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className={`size-4 ${color}`} />
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
