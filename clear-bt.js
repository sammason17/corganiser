import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.balanceTransfer.deleteMany({});
  console.log('Deleted all balance transfers');
}
main().catch(console.error).finally(() => prisma.$disconnect());
