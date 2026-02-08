import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: `${process.env.DATABASE_PUBLIC_URL}?connection_limit=10&pool_timeout=20&connect_timeout=30`,
    },
  },
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    // Database connected successfully
  } catch (error) {
    console.error('❌ Database connection error:', error);
    throw error;
  }
}

// Health check with retry logic
export async function healthCheck(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error(`Database health check failed (attempt ${i + 1}):`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return false;
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    // Database disconnected successfully
  } catch (error) {
    console.error('❌ Database disconnection error:', error);
    throw error;
  }
}
