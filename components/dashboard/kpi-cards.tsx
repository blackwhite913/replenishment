"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Package, AlertTriangle, Eye, Warehouse, Info } from "lucide-react"
import type { SkuItem } from "@/lib/placeholder-data"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SPARKLINE_HEIGHTS = [40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50]

interface KpiCardsProps {
  data: SkuItem[]
  totalSkuCount?: number
}

export function KpiCards({ data, totalSkuCount }: KpiCardsProps) {
  const totalSkus = totalSkuCount ?? data.length
  const atRisk = data.filter((d) => d.status === "oosRisk").length
  const monitoring = data.filter((d) => d.status === "monitoring").length

  const [stockOnHand, setStockOnHand] = useState<{
    loading: boolean
    error: boolean
    timeout: boolean
    total: number | null
  }>({ loading: true, error: false, timeout: false, total: null })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    setStockOnHand({ loading: true, error: false, timeout: false, total: null })

    fetch("/api/unleashed/cw-products", { signal: controller.signal })
      .then((res) => {
        return res.json().then((body) => ({ ok: res.ok, body }))
      })
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body?.message || "Failed to fetch")
        setStockOnHand({
          loading: false,
          error: false,
          timeout: false,
          total: body.totalQtyOnHand ?? null,
        })
      })
      .catch((err: unknown) => {
        const isTimeout = err instanceof Error && err.name === "AbortError"
        setStockOnHand({ loading: false, error: true, timeout: isTimeout, total: null })
      })
      .finally(() => clearTimeout(timeout))
  }, [retryKey])

  const cards = [
    {
      label: "Analyzed SKUs",
      value: totalSkus.toLocaleString(),
      subtitle: "Excludes BOM parent SKUs (assemblies)",
      titleTooltip:
        "This count excludes assembly SKUs (BOM parents) which are built from components and not directly stocked.",
      icon: Package,
      accentColor: "from-emerald-500/20 to-emerald-500/5",
      iconColor: "text-emerald-400",
      borderAccent: "border-l-emerald-500",
    },
    {
      label: "SKUs at Risk",
      value: atRisk.toLocaleString(),
      subtitle: undefined as string | undefined,
      icon: AlertTriangle,
      accentColor: "from-red-500/20 to-red-500/5",
      iconColor: "text-red-400",
      borderAccent: "border-l-red-500",
    },
    {
      label: "Monitoring",
      value: monitoring.toLocaleString(),
      subtitle: undefined as string | undefined,
      icon: Eye,
      accentColor: "from-amber-500/20 to-amber-500/5",
      iconColor: "text-amber-400",
      borderAccent: "border-l-amber-500",
    },
    {
      label: "3PL Stock",
      value: "",
      subtitle: undefined as string | undefined,
      icon: Warehouse,
      accentColor: "from-blue-500/20 to-blue-500/5",
      iconColor: "text-blue-400",
      borderAccent: "border-l-blue-500",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const displayValue =
          card.label === "3PL Stock"
            ? stockOnHand.loading
              ? null
              : stockOnHand.timeout
                ? "Timeout"
                : stockOnHand.error
                  ? "Error"
                  : stockOnHand.total !== null
                    ? stockOnHand.total.toLocaleString()
                    : "\u2014"
            : card.value

        const cardContent = (
          <>
            {/* Background accent glow */}
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accentColor} opacity-50`} />

            <div className="relative flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {card.label}
                    {card.label === "Analyzed SKUs" && card.titleTooltip && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center text-muted-foreground/80 hover:text-foreground">
                            <Info className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6} className="max-w-xs">
                          {card.titleTooltip}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </p>
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {card.label === "3PL Stock" && stockOnHand.loading ? (
                    <span className="inline-flex items-center gap-2 text-base font-medium text-muted-foreground">
                      <Spinner className="size-4 text-primary/70" />
                      Loading
                    </span>
                  ) : (
                    displayValue
                  )}
                </p>
                {card.label === "Analyzed SKUs" && card.subtitle && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {card.subtitle}
                  </p>
                )}
                {card.label === "3PL Stock" && stockOnHand.error && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setRetryKey((value) => value + 1)
                    }}
                    className="mt-1 text-[10px] font-medium text-primary underline underline-offset-2"
                  >
                    Retry
                  </button>
                )}
              </div>
              <div className={`flex size-10 items-center justify-center rounded-xl bg-secondary/80 ${card.iconColor} transition-transform group-hover:scale-110`}>
                <card.icon className="size-5" />
              </div>
            </div>

            {/* Mini sparkline decoration */}
            <div className="relative mt-3 flex items-end gap-[2px] h-6">
              {SPARKLINE_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${card.iconColor} opacity-20`}
                  style={{ height: `${Math.max(15, h)}%` }}
                />
              ))}
            </div>
          </>
        )

        const cardClassName = `group relative overflow-hidden rounded-xl border border-border bg-card p-4 border-l-[3px] ${card.borderAccent} transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/20`

        return (
          <div key={card.label}>
            {card.label === "3PL Stock" ? (
              <Link href="/stock-on-hand" className="block">
                <div className={cardClassName}>{cardContent}</div>
              </Link>
            ) : (
              <div className={cardClassName}>{cardContent}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
