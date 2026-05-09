declare namespace NodeJS {
  interface ProcessEnv {
    ANTHROPIC_API_KEY: string
    DATABASE_URL: string
    NEXTAUTH_SECRET: string
    NEXTAUTH_URL: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    RESEND_API_KEY?: string
    EMAIL_SERVER?: string
    EMAIL_FROM?: string
    S3_BUCKET?: string
    S3_ENDPOINT?: string
    S3_ACCESS_KEY?: string
    S3_SECRET_KEY?: string
    REDIS_URL?: string
    DEMO_WEBHOOK_URL?: string
    NEXT_PUBLIC_APP_URL: string
  }
}
