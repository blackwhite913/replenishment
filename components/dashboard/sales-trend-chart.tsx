"use client"

import { useEffect, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { TrendingUp } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

interface SalesDayPoint {
  date: string
  units: number
}

interface SalesTrendResponse {
  last90Days: SalesDayPoint[]
  total90Days: number
  lastUpdated: number
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

export function SalesTrendChart() {
  const [state, setState] = useState<{
    loading: boolean
    error: boolean
    data: SalesTrendResponse | null
  }>({ loading: true, error: false, data: null })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    setState({ loading: true, error: false, data: null })

    fetch("/api/unleashed/sales-trend", { signal: controller.signal })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body?.detail || body?.error || "Failed to fetch")
        setState({ loading: false, error: false, data: body })
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false, error: true }))
      })
      .finally(() => clearTimeout(timeout))
  }, [retryKey])

  if (state.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">90-Day Sales Trend</h3>
          <span className="text-[10px] rounded-md bg-secondary px-2 py-0.5 text-muted-foreground font-medium">
            Last 90 days
          </span>
        </div>
        <div className="h-64 w-full flex flex-col items-center justify-center gap-4">
          <Spinner className="size-10 text-primary" />
          <p className="text-sm text-muted-foreground">Loading sales data from Unleashed...</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">90-Day Sales Trend</h3>
        </div>
        <div className="h-64 w-full flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">Failed to load sales data</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="text-sm font-medium text-primary underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const data = state.data
  if (!data?.last90Days?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">90-Day Sales Trend</h3>
          <span className="text-[10px] rounded-md bg-secondary px-2 py-0.5 text-muted-foreground font-medium">
            Last 90 days
          </span>
        </div>
        <div className="h-64 w-full flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">No sales data available</p>
        </div>
      </div>
    )
  }

  const chartData = data.last90Days.map((p) => ({
    ...p,
    displayDate: formatDateForAxis(p.date),
  }))

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">90-Day Sales Trend</h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <TrendingUp className="size-3 text-emerald-400" />
            <span className="font-semibold text-foreground">{data.total90Days.toLocaleString()}</span>
            units (90 days)
          </span>
          <span className="text-[10px] rounded-md bg-secondary px-2 py-0.5 text-muted-foreground font-medium">
            Last 90 days
          </span>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2e37" vertical={false} />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 9, fill: "#8b919a" }}
              interval={Math.floor(chartData.length / 6)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#8b919a" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={customTooltipStyle}
              formatter={(value: number) => [value.toLocaleString(), "Units"]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.date ? formatDateForAxis(payload[0].payload.date) : ""
              }
            />
            <Area
              type="monotone"
              dataKey="units"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#salesTrendGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
