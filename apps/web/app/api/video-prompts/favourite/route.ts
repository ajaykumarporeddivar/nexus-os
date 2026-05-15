import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error
  const { id, isFavourite } = await req.json().catch(() => ({})) as { id?: string; isFavourite?: boolean }
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  try {
    await prisma.videoPrompt.update({ where: { id }, data: { isFavourite: !!isFavourite } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[video-prompts/favourite PATCH]', err)
    return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession()
  if (auth.error) return auth.error
  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  try {
    await prisma.videoPrompt.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[video-prompts/favourite DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Delete failed' }, { status: 500 })
  }
}
