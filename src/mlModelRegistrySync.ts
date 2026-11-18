import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';

interface RegistryModel {
    name: string;
    version: string;
    role: string;
    status: string;
    artifact: string;
    artifactSha256?: string;
    stage?: string;
    calibratorArtifact?: string;
    calibratorSha256?: string;
    featureSchemaVersion?: string;
    datasetHash?: string;
    trainingWindow?: { start?: string; end?: string };
    productionEligible: boolean;
    metrics?: Record<string, unknown>;
}

interface ModelRegistry {
    featureSchemaVersion: string;
    datasetHash?: string;
    trainingWindow?: { start?: string; end?: string };
    promotion?: { eligible?: boolean; reasons?: string[] };
    models: RegistryModel[];
}

function optionalDate(value: string | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function syncModelRegistry(artifactDirectory = path.resolve('python_ml', 'artifacts')): Promise<number> {
    const registryPath = path.join(artifactDirectory, 'registry.json');
    const evaluationPath = path.join(artifactDirectory, 'evaluation.json');
    if (!fs.existsSync(registryPath)) throw new Error(`ML registry does not exist: ${registryPath}`);
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ModelRegistry;
    if (!registry.featureSchemaVersion || !Array.isArray(registry.models) || !registry.models.length) {
        throw new Error('ML registry is incomplete.');
    }
    const evaluation = fs.existsSync(evaluationPath)
        ? JSON.parse(fs.readFileSync(evaluationPath, 'utf8')) as Record<string, unknown>
        : {};
    const approvedChampion = registry.models.find(model => (
        model.role === 'CHAMPION' && model.status === 'APPROVED' && model.productionEligible === true
    ));
    const approvedTrigger = registry.models.find(model => (
        model.role === 'TRIGGER' && model.status === 'APPROVED' && model.productionEligible === true
    ));
    const approvedPostTrigger = registry.models.find(model => (
        model.role === 'POST_TRIGGER_CHAMPION' && model.status === 'APPROVED' && model.productionEligible === true
    ));

    await prisma.$transaction(async transaction => {
        if (approvedChampion) {
            await transaction.mlModelVersion.updateMany({
                where: {
                    role: 'CHAMPION',
                    productionEligible: true,
                    NOT: { modelName: approvedChampion.name, version: approvedChampion.version },
                },
                data: { status: 'RETIRED', productionEligible: false },
            });
        }
        if (approvedTrigger) {
            await transaction.mlModelVersion.updateMany({
                where: {
                    role: 'TRIGGER',
                    productionEligible: true,
                    NOT: { modelName: approvedTrigger.name, version: approvedTrigger.version },
                },
                data: { status: 'RETIRED', productionEligible: false },
            });
        }
        if (approvedPostTrigger) {
            await transaction.mlModelVersion.updateMany({
                where: {
                    role: 'POST_TRIGGER_CHAMPION',
                    productionEligible: true,
                    NOT: { modelName: approvedPostTrigger.name, version: approvedPostTrigger.version },
                },
                data: { status: 'RETIRED', productionEligible: false },
            });
        }
        for (const model of registry.models) {
            const artifactUri = path.resolve(artifactDirectory, model.artifact);
            if (!fs.existsSync(artifactUri)) throw new Error(`Missing model artifact: ${artifactUri}`);
            if (model.calibratorArtifact) {
                const calibratorUri = path.resolve(artifactDirectory, model.calibratorArtifact);
                if (!fs.existsSync(calibratorUri)) throw new Error(`Missing model calibrator: ${calibratorUri}`);
            }
            const promotionReport = {
                ...(registry.promotion ?? {}),
                evaluation,
                artifactSha256: model.artifactSha256 ?? null,
                stage: model.stage ?? null,
                calibratorArtifact: model.calibratorArtifact ?? null,
                calibratorSha256: model.calibratorSha256 ?? null,
            } as Prisma.InputJsonValue;
            await transaction.mlModelVersion.upsert({
                where: { modelName_version: { modelName: model.name, version: model.version } },
                create: {
                    modelName: model.name,
                    version: model.version,
                    role: model.role,
                    status: model.status,
                    featureSchemaVersion: model.featureSchemaVersion ?? registry.featureSchemaVersion,
                    artifactUri,
                    datasetHash: model.datasetHash ?? registry.datasetHash,
                    trainingWindowStart: optionalDate(model.trainingWindow?.start ?? registry.trainingWindow?.start),
                    trainingWindowEnd: optionalDate(model.trainingWindow?.end ?? registry.trainingWindow?.end),
                    metrics: (model.metrics ?? {}) as Prisma.InputJsonValue,
                    promotionReport,
                    productionEligible: model.productionEligible === true,
                    promotedAt: model.productionEligible === true ? new Date() : null,
                },
                update: {
                    role: model.role,
                    status: model.status,
                    featureSchemaVersion: model.featureSchemaVersion ?? registry.featureSchemaVersion,
                    artifactUri,
                    datasetHash: model.datasetHash ?? registry.datasetHash,
                    trainingWindowStart: optionalDate(model.trainingWindow?.start ?? registry.trainingWindow?.start),
                    trainingWindowEnd: optionalDate(model.trainingWindow?.end ?? registry.trainingWindow?.end),
                    metrics: (model.metrics ?? {}) as Prisma.InputJsonValue,
                    promotionReport,
                    productionEligible: model.productionEligible === true,
                    promotedAt: model.productionEligible === true ? new Date() : null,
                },
            });
        }
    });
    console.log(`[ML] Synced ${registry.models.length} model versions to PostgreSQL; production eligible: ${Boolean(approvedChampion)}.`);
    return registry.models.length;
}

if (require.main === module) {
    syncModelRegistry()
        .catch(error => {
            console.error('[ML] Registry sync failed:', error?.message ?? error);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
