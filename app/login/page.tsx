import { Suspense } from "react"
import { SignInButton } from "./sign-in-button"

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.12),transparent_45%)]" />
      <div className="relative w-full max-w-xl rounded-3xl border border-border/60 bg-card/95 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
        <div className="mx-auto mb-7 w-fit rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Inventory Replenishment
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            stock-ly
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Sign in with your company Google account to continue.
          </p>
        </div>

        <Suspense fallback={<div className="h-12 rounded-xl bg-muted/70 animate-pulse" />}>
          <SignInButton />
        </Suspense>
      </div>
    </div>
  )
}
