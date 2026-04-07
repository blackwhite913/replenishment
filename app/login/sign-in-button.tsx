"use client"

import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

export function SignInButton() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/"

  return (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => signIn("google", { callbackUrl })}
    >
      <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-background text-[11px] font-bold text-foreground">
        G
      </span>
      Sign in with Google
    </Button>
  )
}
