import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding NEXUS OS database…')

  // Seed demo vault prompts
  const vaultItems = [
    { id: 'bakery',    title: 'Instagram Bakery Content Automation v2.0' },
    { id: 'generic',   title: 'Generic Social Media Content Engine v3.0' },
    { id: 'linkedin',  title: 'LinkedIn B2B Lead Engine v1.0' },
    { id: 'email',     title: 'Email Marketing Engine v2.0' },
    { id: 'seo',       title: 'SEO Content Engine v1.0' },
    { id: 'jd',        title: 'Job Description Generator v1.0' },
    { id: 'report',    title: 'Analytics Report Generator v1.0' },
    { id: 'whatsapp',  title: 'WhatsApp Broadcast Engine v1.0' },
  ]

  for (const item of vaultItems) {
    await prisma.vaultPrompt.upsert({
      where: { id: item.id },
      update: { title: item.title },
      create: { id: item.id, vaultItemId: item.id, title: item.title, content: '', version: 1 },
    })
  }

  // Seed demo execution for dashboard demo mode
  await prisma.execution.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      sessionId: 'demo',
      inputSnippet: 'Build a recruitment automation platform with AI-powered candidate screening',
      clientName: 'Demo Agency',
      phases: ['Boot','Analyze','Architect','Plan','Scaffold','Build','Test','Secure','Deliver'],
      tokens: 24500,
      calls: 9,
      score: 8.7,
      passed: true,
      status: 'APPROVED',
      fileCount: 8,
    },
  })

  console.log('Seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
