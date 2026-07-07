import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const r = await prisma.whatsAppSession.deleteMany()
console.log('Sessões deletadas:', r.count)
await prisma.$disconnect()
