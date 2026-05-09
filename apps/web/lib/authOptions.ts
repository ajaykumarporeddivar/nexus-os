import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Provider } from 'next-auth/providers/index'
import type { NextAuthOptions } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'

const providers: Provider[] = []

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  )
}

if (process.env.EMAIL_SERVER) {
  providers.push(
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from:   process.env.EMAIL_FROM ?? 'noreply@nexus-os.ai',
    })
  )
}

if (process.env.NODE_ENV === 'development') {
  const devPassword = process.env.DEV_AUTH_PASSWORD ?? 'nexus-dev'
  providers.push(
    CredentialsProvider({
      id:   'dev-credentials',
      name: 'Dev Login',
      credentials: {
        email:    { label: 'Email',    type: 'email',    placeholder: 'you@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || credentials.password !== devPassword) return null
        return { id: credentials.email, email: credentials.email, name: credentials.email.split('@')[0] }
      },
    })
  )
}

// Owner/admin emails always receive enterprise plan — cannot be downgraded
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? 'aporeddiporeddy8@gmail.com')
    .split(',').map(e => e.trim()).filter(Boolean)
)

export const authOptions: NextAuthOptions = {
  providers,
  secret:  process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 86400 * 30, updateAge: 3600 },
  pages: {
    signIn: '/auth/signin',
    error:  '/auth/signin',
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      // DB sync is best-effort — never block sign-in (handles Neon cold-start timeouts)
      Promise.resolve().then(async () => {
        try {
          const existing = await prisma.user.findUnique({
            where:  { email: user.email! },
            select: { id: true },
          })
          await prisma.user.upsert({
            where:  { email: user.email! },
            create: { email: user.email!, name: user.name ?? null, image: user.image ?? null },
            update: { name: user.name ?? undefined, image: user.image ?? undefined },
          })
          if (!existing && user.email) {
            sendWelcomeEmail(user.email, user.name ?? '').catch(console.error)
          }
        } catch (err) {
          console.error('[auth signIn upsert]', err)
        }
      })
      return true
    },

    async jwt({ token, user, trigger, session: newSession }) {
      try {
        if (user?.email) {
          // Admin bypass — owner email always gets enterprise, no DB required
          if (ADMIN_EMAILS.has(user.email)) {
            token.plan    = 'enterprise'
            token.isAdmin = true
          } else {
            try {
              const dbUser = await prisma.user.findUnique({
                where:  { email: user.email },
                select: { id: true, plan: true },
              })
              if (dbUser) { token.sub = dbUser.id; token.plan = dbUser.plan ?? 'free' }
            } catch { /* non-fatal — DB may be cold-starting */ }
            if (!token.plan) token.plan = 'free'
          }
          // Best-effort: sync DB id (non-blocking for admin)
          if (!token.sub) {
            try {
              const dbUser = await prisma.user.findUnique({
                where:  { email: user.email },
                select: { id: true },
              })
              if (dbUser) token.sub = dbUser.id
            } catch { /* non-fatal */ }
          }
        }

        // Hourly token refresh — re-read plan from DB (admin emails stay enterprise)
        if (!user && token.sub && !trigger) {
          const email = token.email as string | undefined
          if (email && ADMIN_EMAILS.has(email)) {
            token.plan    = 'enterprise'
            token.isAdmin = true
          } else {
            try {
              const dbUser = await prisma.user.findUnique({
                where:  { id: token.sub as string },
                select: { plan: true },
              })
              if (dbUser?.plan) token.plan = dbUser.plan
            } catch { /* non-fatal */ }
          }
        }

        if (trigger === 'update' && newSession?.plan) {
          // Admin plan cannot be overridden via session update
          const email = token.email as string | undefined
          if (!email || !ADMIN_EMAILS.has(email)) {
            token.plan = newSession.plan
          }
        }
      } catch (err) {
        // Last-resort: never let JWT callback crash — return token as-is
        console.error('[auth jwt]', err)
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        const u = session.user as { id?: string; plan?: string; isAdmin?: boolean }
        u.id      = token.sub as string | undefined
        u.plan    = (token.plan as string) ?? 'free'
        u.isAdmin = (token.isAdmin as boolean) ?? false
      }
      return session
    },
  },
}
