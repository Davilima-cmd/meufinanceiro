import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_CATEGORIES = [
  { name: 'Alimentação', color: '#EF4444' },
  { name: 'Transporte', color: '#3B82F6' },
  { name: 'Moradia', color: '#8B5CF6' },
  { name: 'Saúde', color: '#10B981' },
  { name: 'Educação', color: '#F59E0B' },
  { name: 'Lazer', color: '#EC4899' },
  { name: 'Salário', color: '#22C55E' },
  { name: 'Outras receitas', color: '#6B7280' },
];

async function main() {
  for (const category of SYSTEM_CATEGORIES) {
    const exists = await prisma.category.findFirst({
      where: { name: category.name, userId: null, isSystem: true },
    });

    if (!exists) {
      await prisma.category.create({
        data: {
          ...category,
          userId: null,
          isSystem: true,
        },
      });
    }
  }

  // Backfill MFA: usuários existentes sem MFA configurada ficam com mfaEnabled = false
  // (o default da coluna já cobre novas inserções; este passo é explícito para linhas já existentes)
  await prisma.user.updateMany({
    where: {
      NOT: { mfaEnabled: true },
    },
    data: { mfaEnabled: false },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
