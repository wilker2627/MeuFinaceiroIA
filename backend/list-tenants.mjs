import { prisma } from './src/config/database.js'

try {
  const tenants = await prisma.tenant.findMany({
    select: { email: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  console.log(JSON.stringify(tenants, null, 2))
} finally {
  await prisma.$disconnect()
}
