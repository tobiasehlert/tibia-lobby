import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { World } from '../db/entities/world.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const worldRepo = app.get<typeof World>(getRepositoryToken(World)) as any;

    console.log('> Buscando mundos do Tibia Global na TibiaData API...');
    const res = await fetch('https://api.tibiadata.com/v5/worlds');
    if (!res.ok) {
      throw new Error(`Falha ao consultar TibiaData: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    // Estrutura esperada: { worlds: { regular_worlds: [{ name: string, ... }] } }
    const list: string[] =
      data?.worlds?.regular_worlds?.map((w: any) => w?.name)?.filter(Boolean) ?? [];

    if (!list.length) {
      console.warn('Nenhum mundo retornado pela API. Verifique mudanças na TibiaData.');
      return;
    }

    console.log(`> Encontrados ${list.length} mundos. Iniciando upsert no banco...`);

    let created = 0;
    for (const name of list) {
      const existing = await worldRepo.findOne({ where: { name } });
      if (existing) {
        // Garante flag isGlobal = true se já existir
        if (!existing.isGlobal) {
          existing.isGlobal = true;
          await worldRepo.save(existing);
        }
        continue;
      }
      const world = worldRepo.create({ name, isGlobal: true });
      await worldRepo.save(world);
      created++;
    }

    console.log(`> Seed finalizado. Mundos criados: ${created}. Total no banco pode ser maior (registros já existentes foram mantidos).`);
  } catch (err) {
    console.error('Erro ao executar seed de mundos globais:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main();
