import {
    describe,
    expect,
    it
} from 'vitest';

import { FlexModeSchema } from '../../types/FlexMode';
import {
    SETTINGS_SCHEMA_ID,
    STATUS_JSON_SCHEMA_ID,
    buildJsonSchema,
    buildSettingsJsonSchema,
    buildStatusJsonSchema,
    isSchemaTarget
} from '../schema';

interface LooseSchema {
    $schema?: string;
    $id?: string;
    title?: string;
    type?: string;
    properties?: Record<string, LooseSchema | undefined>;
    enum?: unknown[];
}

function roundTrip(schema: unknown): LooseSchema {
    return JSON.parse(JSON.stringify(schema)) as LooseSchema;
}

describe('buildSettingsJsonSchema', () => {
    const schema = roundTrip(buildSettingsJsonSchema());

    it('declares draft 2020-12 with a stable $id and title', () => {
        expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
        expect(schema.$id).toBe(SETTINGS_SCHEMA_ID);
        expect(schema.$id).toBe('https://github.com/sirmalloc/ccstatusline/schema/settings.json');
        expect(schema.title).toBe('ccstatusline settings');
    });

    it('describes an object with the settings lines', () => {
        expect(schema.type).toBe('object');
        expect(schema.properties?.lines).toBeDefined();
        expect(schema.properties?.lines?.type).toBe('array');
    });

    it('lists the flex modes as an enum matching FlexModeSchema', () => {
        expect(schema.properties?.flexMode?.enum).toEqual(FlexModeSchema.options);
    });

    it('puts the identifying keys first so the document reads top-down', () => {
        expect(Object.keys(schema).slice(0, 3)).toEqual(['$schema', '$id', 'title']);
    });
});

describe('buildStatusJsonSchema', () => {
    const schema = roundTrip(buildStatusJsonSchema());

    it('declares draft 2020-12 with a stable $id and title', () => {
        expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
        expect(schema.$id).toBe(STATUS_JSON_SCHEMA_ID);
        expect(schema.$id).toBe('https://github.com/sirmalloc/ccstatusline/schema/status-json.json');
        expect(schema.title).toBe('Claude Code status JSON');
    });

    it('describes the status payload object with its known fields', () => {
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['model', 'cost', 'context_window', 'transcript_path']));
    });
});

describe('buildJsonSchema', () => {
    it('selects the schema by target', () => {
        expect(roundTrip(buildJsonSchema('settings'))).toEqual(roundTrip(buildSettingsJsonSchema()));
        expect(roundTrip(buildJsonSchema('status-json'))).toEqual(roundTrip(buildStatusJsonSchema()));
    });
});

describe('isSchemaTarget', () => {
    it('accepts the two documented targets and nothing else', () => {
        expect(isSchemaTarget('settings')).toBe(true);
        expect(isSchemaTarget('status-json')).toBe(true);
        expect(isSchemaTarget('status')).toBe(false);
        expect(isSchemaTarget('')).toBe(false);
    });
});
