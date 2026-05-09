export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'NEXUS OS',
  version: process.env.NEXT_PUBLIC_BRAND_VERSION ?? 'v11',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? 'AI Delivery Infrastructure for Digital Agencies',
  domain: process.env.NEXT_PUBLIC_BRAND_DOMAIN ?? 'nexus-os.ai',
  supportEmail: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL ?? 'support@nexus-os.ai',
  color: process.env.NEXT_PUBLIC_BRAND_COLOR ?? '#8B5CF6',
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL ?? null,
} as const

export type Brand = typeof brand

export const fullName = `${brand.name} ${brand.version}`
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${brand.domain}`
