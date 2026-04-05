import { PrismaClient } from '@prisma/client'

// Prevent multiple Prisma instances in serverless/dev environments
const globalForPrisma = global

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
