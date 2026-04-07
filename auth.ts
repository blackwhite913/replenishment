import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const REQUIRED_AUTH_ENV_VARS = [
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_EMAIL_DOMAIN",
] as const

type RequiredAuthEnvVar = (typeof REQUIRED_AUTH_ENV_VARS)[number]

type EnvState = "present" | "missing" | "empty string"

type AuthEnvStatus = Record<RequiredAuthEnvVar, EnvState>
type AuthEnvValues = Record<RequiredAuthEnvVar, string>

function inspectAuthEnv(): {
  status: AuthEnvStatus
  values: Partial<AuthEnvValues>
  invalidVars: RequiredAuthEnvVar[]
} {
  const status = {} as AuthEnvStatus
  const values: Partial<AuthEnvValues> = {}
  const invalidVars: RequiredAuthEnvVar[] = []

  for (const key of REQUIRED_AUTH_ENV_VARS) {
    const rawValue = process.env[key]

    if (rawValue === undefined) {
      status[key] = "missing"
      invalidVars.push(key)
      continue
    }

    if (rawValue.trim().length === 0) {
      status[key] = "empty string"
      invalidVars.push(key)
      continue
    }

    status[key] = "present"
    values[key] = rawValue
  }

  return { status, values, invalidVars }
}

export function getAuthEnvDiagnostics() {
  const { status, invalidVars } = inspectAuthEnv()
  return {
    authConfigured: invalidVars.length === 0,
    missingVars: invalidVars,
    status,
  }
}

const authEnvInspection = inspectAuthEnv()

for (const key of REQUIRED_AUTH_ENV_VARS) {
  const state = authEnvInspection.status[key]
  if (state === "present") {
    console.info(`[auth][env] ${key}: present`)
  } else if (state === "empty string") {
    console.error(`[auth][env] ${key}: empty string`)
  } else {
    console.error(`[auth][env] ${key}: missing`)
  }
}

if (authEnvInspection.invalidVars.length > 0) {
  const missingList = authEnvInspection.invalidVars.join(", ")
  console.error(`[auth] Missing required auth configuration: ${missingList}`)
  throw new Error(`[auth] Missing required auth configuration: ${missingList}`)
}

console.info("[auth] Auth system ready")

const authEnv = authEnvInspection.values as AuthEnvValues
const allowedDomain = authEnv.ALLOWED_EMAIL_DOMAIN.replace(/^@/, "").toLowerCase()

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authEnv.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: authEnv.GOOGLE_CLIENT_ID,
      clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase()
      if (!email) {
        return false
      }

      return email.endsWith(`@${allowedDomain}`)
    },
  },
  pages: {
    signIn: "/login",
  },
})
