import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';
import { World } from '../db/entities/world.entity';
import { OtServer } from '../db/entities/otserver.entity';
import { ActivityType } from '../db/entities/activityType';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SeederService.name);

    constructor(
        @InjectRepository(World)
        private readonly worldRepo: Repository<World>,
        @InjectRepository(OtServer)
        private readonly otRepo: Repository<OtServer>,
        @InjectRepository(ActivityType)
        private readonly activityTypeRepo: Repository<ActivityType>,
    ) { }

    async onApplicationBootstrap() {
        // Permite desativar via env em prod se necessário
        const shouldSeed = process.env.SEED_ON_BOOT !== 'false';
        if (!shouldSeed) {
            this.logger.log('Seed on boot desativado por SEED_ON_BOOT=false');
            return;
        }

        try {
            await this.seedGlobalWorlds();
            await this.seedOtServers();
            await this.seedActivityTypes();
        } catch (err) {
            this.logger.error('Erro durante seeding on boot', err as any);
        }
    }

    private async seedGlobalWorlds() {
        // Somente executa se não houver ao menos alguns mundos globais
        const count = await this.worldRepo.count({ where: { isGlobal: true } });
        if (count > 0) {
            this.logger.log(`Mundos globais já presentes (${count}). Skipping.`);
            return;
        }

        let list: string[] = [];
        try {
            this.logger.log('Buscando mundos globais (TibiaData)...');
            const res = await axios.get('https://api.tibiadata.com/v5/worlds', { timeout: 10000 });
            list = res?.data?.worlds?.regular_worlds?.map((w: any) => w?.name)?.filter(Boolean) ?? [];
        } catch (e) {
            this.logger.warn(`Falha ao chamar TibiaData, usando fallback local. Motivo: ${(e as any)?.message ?? e}`);
        }
        if (!list.length) {
            const fallbackPath = path.join(process.cwd(), 'src', 'seed', 'data', 'tibia-worlds.json');
            const raw = await fs.readFile(fallbackPath, 'utf8');
            const json = JSON.parse(raw);
            list = (json?.worlds as string[]) || [];
        }
        if (!list.length) {
            this.logger.warn('Nenhuma lista de mundos disponível (API e fallback falharam).');
            return;
        }

        let created = 0;
        for (const name of list) {
            const existing = await this.worldRepo.findOne({ where: { name } });
            if (existing) {
                if (!existing.isGlobal) {
                    existing.isGlobal = true;
                    await this.worldRepo.save(existing);
                }
                continue;
            }
            const world = this.worldRepo.create({ name, isGlobal: true });
            await this.worldRepo.save(world);
            created++;
        }
        this.logger.log(`Seed de mundos globais concluído. Criados: ${created}.`);
    }

    private async seedOtServers() {
        // Lê lista parametrizada via JSON
        const otFile = path.join(process.cwd(), 'src', 'seed', 'data', 'otservers.json');
        const otRaw = await fs.readFile(otFile, 'utf8');
        const otJson = JSON.parse(otRaw) as { servers: Array<{ name: string; worlds: string[] }> };
        const otSeeds = otJson.servers ?? [];

        let createdServers = 0;
        let createdWorlds = 0;

        for (const { name, worlds } of otSeeds) {
            let ot = await this.otRepo.findOne({ where: { name }, relations: ['worlds'] });
            if (!ot) {
                ot = this.otRepo.create({ name });
                ot = await this.otRepo.save(ot);
                createdServers++;
            }
            for (const wName of worlds) {
                const exists = await this.worldRepo.findOne({ where: { name: wName } });
                if (exists) continue;
                const world = this.worldRepo.create({ name: wName, isGlobal: false, otServer: ot });
                await this.worldRepo.save(world);
                createdWorlds++;
            }
        }
        this.logger.log(`Seed de OTs concluído. OTs criados: ${createdServers}, mundos criados: ${createdWorlds}.`);
    }

    private async seedActivityTypes() {
        const baseActivities = [
            'Hunt',
            'Quest',
            'PvP',
            'Rotacao Boss',
            'War',
            'Evento',
            'Team Hunt',
            'Bestiário',
            'Boss diário',
            'Service (Task/Boss)',
            'Charm Farm'
        ];

        let created = 0;
        for (const name of baseActivities) {
            const exists = await this.activityTypeRepo.findOne({ where: { name } });
            if (exists) continue;
            await this.activityTypeRepo.save(this.activityTypeRepo.create({ name }));
            created++;
        }
        this.logger.log(`Seed de Activity Types concluído. Criados: ${created}.`);
    }
}
