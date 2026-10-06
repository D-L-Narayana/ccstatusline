import { z } from 'zod';

import { SettingsSchema } from '../types/Settings';
import { StatusJSONSchema } from '../types/StatusJSON';

export const SETTINGS_SCHEMA_ID = 'https://github.com/sirmalloc/ccstatusline/schema/settings.json';
export const STATUS_JSON_SCHEMA_ID = 'https://github.com/sirmalloc/ccstatusline/schema/status-json.json';

export const SCHEMA_TARGETS = ['settings', 'status-json'] as const;
export type SchemaTarget = typeof SCHEMA_TARGETS[number];

export type JsonSchemaDocument = z.core.JSONSchema.BaseSchema;

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

export function isSchemaTarget(value: string): value is SchemaTarget {
    return (SCHEMA_TARGETS as readonly string[]).includes(value);
}

function toJsonSchema(schema: z.ZodType, id: string, title: string): JsonSchemaDocument {
    // `io: 'input'` documents what a file may contain (defaults stay optional);
    // `unrepresentable: 'any'` keeps the stdin preprocessors from throwing.
    const { $schema, ...generated } = z.toJSONSchema(schema, {
        target: 'draft-2020-12',
        io: 'input',
        unrepresentable: 'any'
    });

    return {
        $schema: $schema ?? DRAFT_2020_12,
        $id: id,
        title,
        ...generated
    };
}

/** JSON Schema for ~/.config/ccstatusline/settings.json. */
export function buildSettingsJsonSchema(): JsonSchemaDocument {
    return toJsonSchema(SettingsSchema, SETTINGS_SCHEMA_ID, 'ccstatusline settings');
}

/** JSON Schema for the Claude Code status payload read from stdin. */
export function buildStatusJsonSchema(): JsonSchemaDocument {
    return toJsonSchema(StatusJSONSchema, STATUS_JSON_SCHEMA_ID, 'Claude Code status JSON');
}

export function buildJsonSchema(target: SchemaTarget): JsonSchemaDocument {
    return target === 'settings' ? buildSettingsJsonSchema() : buildStatusJsonSchema();
}
