import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getSkillsFilePath,
    getSkillsMetrics
} from '../skills';

let testHomeDir = '';
let originalCacheDir: string | undefined;

function writeSkillsLog(sessionId: string, lines: string[]): void {
    const skillsPath = getSkillsFilePath(sessionId);
    fs.mkdirSync(path.dirname(skillsPath), { recursive: true });
    fs.writeFileSync(skillsPath, lines.join('\n'), 'utf-8');
}

describe('skills metrics', () => {
    beforeEach(() => {
        testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-home-'));
        originalCacheDir = process.env.CCSTATUSLINE_CACHE_DIR;
        delete process.env.CCSTATUSLINE_CACHE_DIR;
        vi.spyOn(os, 'homedir').mockReturnValue(testHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalCacheDir === undefined) {
            delete process.env.CCSTATUSLINE_CACHE_DIR;
        } else {
            process.env.CCSTATUSLINE_CACHE_DIR = originalCacheDir;
        }
        if (testHomeDir) {
            fs.rmSync(testHomeDir, { recursive: true, force: true });
        }
    });

    it('uses ~/.cache/ccstatusline/skills path for skill logs', () => {
        expect(getSkillsFilePath('session-1')).toBe(
            path.join(testHomeDir, '.cache', 'ccstatusline', 'skills', 'skills-session-1.jsonl')
        );
    });

    it('places skill logs under CCSTATUSLINE_CACHE_DIR when it is set', () => {
        const cacheDir = path.join(testHomeDir, 'cache-override');
        process.env.CCSTATUSLINE_CACHE_DIR = cacheDir;

        expect(getSkillsFilePath('session-2')).toBe(path.join(cacheDir, 'skills', 'skills-session-2.jsonl'));

        writeSkillsLog('session-2', [JSON.stringify({ skill: 'commit', session_id: 'session-2' })]);

        expect(fs.existsSync(path.join(cacheDir, 'skills', 'skills-session-2.jsonl'))).toBe(true);
        expect(getSkillsMetrics('session-2')).toEqual({
            totalInvocations: 1,
            uniqueSkills: ['commit'],
            lastSkill: 'commit'
        });
        expect(fs.existsSync(path.join(testHomeDir, '.cache'))).toBe(false);
    });

    it('returns total, unique (most-recent-first), and last skill from a valid log', () => {
        writeSkillsLog('session-1', [
            JSON.stringify({ skill: 'commit', session_id: 'session-1' }),
            JSON.stringify({ skill: 'review-pr', session_id: 'session-1' }),
            JSON.stringify({ skill: 'lint', session_id: 'session-1' }),
            JSON.stringify({ skill: 'commit', session_id: 'session-1' })
        ]);

        expect(getSkillsMetrics('session-1')).toEqual({
            totalInvocations: 4,
            uniqueSkills: ['commit', 'lint', 'review-pr'],
            lastSkill: 'commit'
        });
    });
});
