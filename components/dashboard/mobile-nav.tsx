"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { LayoutDashboard, Menu, TrendingUp, Truck, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const navItems = [
  { icon: LayoutDashboard, label: "Inventory Risk", href: "/", pathMatch: "/" },
  { icon: TrendingUp, label: "Forecasting", href: "/forecasting", pathMatch: "/forecasting" },
  { icon: Truck, label: "Stock on Hand", href: "/stock-on-hand", pathMatch: "/stock-on-hand" },
]

function initialsFromUser(
  name: string | null | undefined,
  email: string | null | undefined
) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return "?"
}

export function MobileNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const user = session?.user
  const label =
    status === "loading"
      ? "..."
      : user?.name || user?.email?.split("@")[0] || "Signed in"
  const sublabel = status === "loading" ? "Loading" : user?.email ?? ""

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px]">
        <SheetHeader>
          <SheetTitle>stock-ly</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex h-full flex-col">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                item.pathMatch === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.pathMatch)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto border-t border-border pt-4">
            <div className="flex items-center gap-3 rounded-lg px-1 py-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                {initialsFromUser(user?.name, user?.email)}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium text-foreground">{label}</p>
                <p className="truncate text-[10px] text-muted-foreground">{sublabel}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
