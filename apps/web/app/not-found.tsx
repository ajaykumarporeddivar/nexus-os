import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper px-4 text-center gap-4">
      <p className="sec-label">404</p>
      <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--ff-d)' }}>
        Page not found
      </h1>
      <p className="text-sm text-ink3 max-w-xs">
        This page doesn&apos;t exist or you don&apos;t have access. Check the URL or go back to your workspace.
      </p>
      <div className="flex gap-3 mt-2">
        <Link href="/shell" className="btn btn-primary text-sm py-2">
          Go to dashboard →
        </Link>
        <Link href="/shell?page=pricing" className="btn btn-ghost text-sm py-2">
          View pricing
        </Link>
      </div>
    </div>
  )
}
