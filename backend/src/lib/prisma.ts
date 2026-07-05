import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

// Prisma 7 requires a driver adapter.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
