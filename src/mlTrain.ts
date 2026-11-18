import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import prisma from './prismaClient';
import { syncModelRegistry } from './mlModelRegistrySync';

function pythonExecutable(): string {
    if (process.env.ML_PYTHON_BIN) return process.env.ML_PYTHON_BIN;
    const localWindows = path.resolve('python_ml', 'venv', 'Scripts', 'python.exe');
    if (process.platform === 'win32' && fs.existsSync(localWindows)) return localWindows;
    return 'python';
}

function runTrainer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(pythonExecutable(), [path.resolve('python_ml', 'train_rankers.py')], {
            cwd: process.cwd(),
            env: process.env,
            stdio: 'inherit',
            shell: false,
        });
        child.once('error', reject);
        child.once('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`Ranker training exited with code ${code ?? 'unknown'}.`));
        });
    });
}

async function main(): Promise<void> {
    await runTrainer();
    await syncModelRegistry();
}

main()
    .catch(error => {
        console.error('[ML] Training pipeline failed:', error?.message ?? error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
