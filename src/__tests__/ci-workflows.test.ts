import { YAML } from 'bun';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    describe,
    expect,
    it
} from 'vitest';

// Guards the GitHub Actions workflows: CI must keep its automatic triggers,
// its four jobs with their real default commands, and a manual fallback,
// while Publish stays exactly the tag-driven release workflow.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface WorkflowStep {
    uses?: string;
    run?: string;
    with?: Record<string, unknown>;
}

interface WorkflowJob {
    name?: string;
    needs?: string | string[];
    steps: WorkflowStep[];
}

interface Workflow {
    name: string;
    on: Record<string, unknown>;
    jobs: Record<string, WorkflowJob>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readWorkflow(file: string): Workflow {
    const source = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', file), 'utf8');
    const parsed: unknown = YAML.parse(source);
    if (!isRecord(parsed) || typeof parsed.name !== 'string' || !isRecord(parsed.on) || !isRecord(parsed.jobs)) {
        throw new Error(`${file} is not a workflow object`);
    }

    return parsed as unknown as Workflow;
}

function runCommands(job: WorkflowJob): string[] {
    return job.steps.flatMap(step => (typeof step.run === 'string' ? [step.run.trim()] : []));
}

function usesActions(job: WorkflowJob): string[] {
    return job.steps.flatMap(step => (typeof step.uses === 'string' ? [step.uses] : []));
}

const ci = readWorkflow('ci.yml');
const publish = readWorkflow('publish.yml');

describe('CI workflow triggers', () => {
    it('keeps the automatic push trigger for every branch', () => {
        expect(Object.keys(ci.on)).toContain('push');
        // A bare `push:` (no filters) runs on every branch and tag push.
        expect(ci.on.push).toBeNull();
    });

    it('keeps the pull_request trigger restricted to main', () => {
        expect(ci.on.pull_request).toEqual({ branches: ['main'] });
    });

    it('offers an explicit manual fallback without inputs', () => {
        expect(Object.keys(ci.on)).toContain('workflow_dispatch');
        // No inputs: a bare `workflow_dispatch:` so the fallback runs the exact default jobs.
        expect(ci.on.workflow_dispatch).toBeNull();
    });

    it('declares exactly the automatic triggers plus the manual fallback', () => {
        expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
    });
});

describe('CI workflow jobs', () => {
    it('keeps the four jobs with their dependency order', () => {
        expect(Object.keys(ci.jobs)).toEqual(['lint', 'test', 'build', 'smoke']);
        expect(ci.jobs.lint?.needs).toBeUndefined();
        expect(ci.jobs.test?.needs).toBeUndefined();
        expect(ci.jobs.build?.needs).toEqual(['lint', 'test']);
        expect(ci.jobs.smoke?.needs).toEqual(['build']);
    });

    it('runs the real default commands rather than narrowed variants', () => {
        expect(runCommands(ci.jobs.lint ?? { steps: [] })).toEqual(['bun install', 'bun run lint']);
        expect(runCommands(ci.jobs.test ?? { steps: [] })).toEqual(['bun install', 'bun test']);
        expect(runCommands(ci.jobs.build ?? { steps: [] })).toEqual(['bun install', 'bun run build', 'test -f dist/ccstatusline.js']);
        expect(runCommands(ci.jobs.smoke ?? { steps: [] })).toEqual(['bun install', 'bun run build', 'bun run scripts/smoke-dist.ts --no-build']);
    });

    it('never passes a test filter, timeout or reporter override to bun test', () => {
        const everyRun = Object.values(ci.jobs).flatMap(runCommands);
        for (const command of everyRun.filter(run => run.startsWith('bun test'))) {
            expect(command).toBe('bun test');
        }
    });

    it('installs with Bun in every job and sets up Bun before running anything', () => {
        for (const [jobName, job] of Object.entries(ci.jobs)) {
            const actions = usesActions(job);
            expect(actions[0], `${jobName} checks out first`).toMatch(/^actions\/checkout@/);
            expect(actions, `${jobName} sets up Bun`).toContainEqual(expect.stringMatching(/^oven-sh\/setup-bun@/));
        }
    });

    it('runs the smoke against an actual Node runtime', () => {
        const smoke = ci.jobs.smoke ?? { steps: [] };
        const setupNode = smoke.steps.find(step => typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@'));

        expect(setupNode).toBeDefined();
        expect(setupNode?.with?.['node-version']).toBe(20);
        // The smoke script itself executes dist/ccstatusline.js with `node`, never with bun.
        const smokeSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-dist.ts'), 'utf8');
        expect(smokeSource).toContain('spawnSync(\'node\', [distEntry');
    });
});

describe('Publish workflow', () => {
    it('stays tag-driven with no manual or push trigger', () => {
        expect(Object.keys(publish.on)).toEqual(['push']);
        expect(publish.on.push).toEqual({ tags: ['v*'] });
    });

    it('keeps the upstream repository guard and the single publish job', () => {
        expect(Object.keys(publish.jobs)).toEqual(['publish']);
        expect((publish.jobs.publish as WorkflowJob & { if?: string }).if).toBe('github.repository == \'sirmalloc/ccstatusline\'');
    });

    it('keeps lint and the full test suite ahead of npm publish', () => {
        const commands = runCommands(publish.jobs.publish ?? { steps: [] });
        expect(commands.slice(0, 4)).toEqual(['bun install', 'bun run lint', 'bun test', 'npm publish']);
    });
});
