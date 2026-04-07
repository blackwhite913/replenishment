"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart"
import { MobileNav } from "@/components/dashboard/mobile-nav"

export default function ForecastingPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-3">
            <MobileNav />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                Forecasting
              </h1>
              <p className="text-xs text-muted-foreground">
                Sales trends and demand forecasting
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="flex flex-col gap-5 max-w-[1440px]">
            <SalesTrendChart />
          </div>
        </main>
      </div>
    </div>
  )
}
