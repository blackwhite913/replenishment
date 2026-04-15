"use client"

import { Package, AlertTriangle, Eye, Warehouse, Info } from "lucide-react"
import type { SkuItem } from "@/lib/placeholder-data"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SPARKLINE_HEIGHTS = [40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50]

interface KpiCardsProps {
  data: SkuItem[]
  totalSkuCount?: number
  provisional?: boolean
  threePlAvailable?: boolean
  onCardClick?: (cardKey: "atRisk" | "monitoring" | "threePl") => void
}

export function KpiCards({
  data,
  totalSkuCount,
  provisional = false,
  threePlAvailable = true,
  onCardClick,
}: KpiCardsProps) {
  const totalSkus = totalSkuCount ?? data.length
  const atRisk = data.filter((d) => d.status === "oosRisk").length
  const monitoring = data.filter((d) => d.status === "monitoring").length
  const totalThreePlStock = data.reduce((sum, row) => sum + (row.thirdPlStock ?? 0), 0)

  const cards = [
    {
      key: null as null,
      label: "Analyzed SKUs",
      value: totalSkus.toLocaleString(),
      subtitle: "Excludes BOM parent SKUs (assemblies)",
      titleTooltip:
        "This count excludes assembly SKUs (BOM parents) which are built from components and not directly stocked.",
      icon: Package,
      accentColor: "from-emerald-500/20 to-emerald-500/5",
      iconColor: "text-emerald-400",
      borderAccent: "border-l-emerald-500",
      clickable: false,
    },
    {
      key: "atRisk" as const,
      label: "SKUs at Risk",
      value: atRisk.toLocaleString(),
      valueHint: provisional ? "provisional" : null,
      subtitle: undefined as string | undefined,
      icon: AlertTriangle,
      accentColor: "from-red-500/20 to-red-500/5",
      iconColor: "text-red-400",
      borderAccent: "border-l-red-500",
      clickable: true,
    },
    {
      key: "monitoring" as const,
      label: "Monitoring",
      value: monitoring.toLocaleString(),
      valueHint: provisional ? "provisional" : null,
      subtitle: undefined as string | undefined,
      icon: Eye,
      accentColor: "from-amber-500/20 to-amber-500/5",
      iconColor: "text-amber-400",
      borderAccent: "border-l-amber-500",
      clickable: true,
    },
    {
      key: "threePl" as const,
      label: "3PL Stock",
      value: threePlAvailable ? totalThreePlStock.toLocaleString() : "Unavailable",
      subtitle: undefined as string | undefined,
      icon: Warehouse,
      accentColor: "from-blue-500/20 to-blue-500/5",
      iconColor: "text-blue-400",
      borderAccent: "border-l-blue-500",
      clickable: threePlAvailable,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
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
                  {card.value}
                </p>
                {"valueHint" in card && card.valueHint && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {card.valueHint}
                  </p>
                )}
                {card.label === "Analyzed SKUs" && card.subtitle && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {card.subtitle}
                  </p>
                )}
                {card.clickable && onCardClick && (
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    Click to filter
                  </p>
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

        const baseClassName = `group relative overflow-hidden rounded-xl border border-border bg-card p-4 border-l-[3px] ${card.borderAccent} transition-all hover:border-border/80 hover:shadow-lg hover:shadow-black/20`

        if (card.clickable && card.key && onCardClick) {
          return (
            <div key={card.label}>
              <button
                type="button"
                className={`${baseClassName} w-full text-left cursor-pointer`}
                onClick={() => onCardClick(card.key!)}
              >
                {cardContent}
              </button>
            </div>
          )
        }

        return (
          <div key={card.label}>
            <div className={baseClassName}>{cardContent}</div>
          </div>
        )
      })}
    </div>
  )
}
