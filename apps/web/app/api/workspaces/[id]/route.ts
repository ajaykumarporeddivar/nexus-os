import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

async function getOwned(id: string, userId: string | null) {
  return prisma.workspace.findFirst({
    where: { id, ...(userId ? { ownerId: userId } : {}) },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | null)?.id ?? null

  const workspace = await getOwned(params.id, userId)
  if (!workspace) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, type, description, context, emoji, color } = body

  const updated = await prisma.workspace.update({
    where: { id: params.id },
    data: {
      ...(name        !== undefined && { name:        String(name).slice(0, 80) }),
      ...(type        !== undefined && { type:        ['client','feature','internal','personal'].includes(type) ? type : workspace.type }),
      ...(description !== undefined && { description: description ? String(description).slice(0, 200) : null }),
      ...(context     !== undefined && { context:     context     ? String(context).slice(0, 2000)    : null }),
      ...(emoji       !== undefined && { emoji:       String(emoji).slice(0, 4) }),
      ...(color       !== undefined && { color:       String(color).slice(0, 20) }),
    },
  })

  return NextResponse.json({ ok: true, data: { workspace: updated } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | null)?.id ?? null

  const workspace = await getOwned(params.id, userId)
  if (!workspace) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

  await prisma.workspace.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
