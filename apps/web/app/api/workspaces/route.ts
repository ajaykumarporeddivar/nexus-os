import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | null)?.id ?? null

  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: userId ?? undefined },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ ok: true, data: { workspaces } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | null)?.id ?? null

  const body = await req.json()
  const { name, type, description, context, emoji, color } = body

  if (!name?.trim()) {
    return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 })
  }

  const workspace = await prisma.workspace.create({
    data: {
      name:        String(name).slice(0, 80),
      type:        ['client', 'feature', 'internal', 'personal'].includes(type) ? type : 'client',
      description: description ? String(description).slice(0, 200) : null,
      context:     context     ? String(context).slice(0, 2000)    : null,
      emoji:       emoji       ? String(emoji).slice(0, 4)         : '📁',
      color:       color       ? String(color).slice(0, 20)        : 'acid',
      ownerId:     userId,
    },
  })

  return NextResponse.json({ ok: true, data: { workspace } }, { status: 201 })
}
