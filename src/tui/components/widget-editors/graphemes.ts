// Grapheme-cluster helpers for the generic widget editors. Cursor movement,
// deletion and single-symbol input work on user-perceived characters so emoji
// with skin-tone modifiers or ZWJ sequences are never split. Intl.Segmenter is
// used when the runtime provides it; the fallback splits by code point.

const graphemeSegmenter: Intl.Segmenter | null = 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function getGraphemes(text: string): string[] {
    if (graphemeSegmenter) {
        return Array.from(graphemeSegmenter.segment(text), segment => segment.segment);
    }

    return Array.from(text);
}

export function getFirstGrapheme(text: string): string {
    return getGraphemes(text)[0] ?? '';
}

/** String index where the given grapheme starts (clamped to the text length). */
export function graphemeToStringIndex(text: string, graphemeIndex: number): number {
    const graphemes = getGraphemes(text);
    let stringIndex = 0;

    for (let i = 0; i < Math.min(graphemeIndex, graphemes.length); i++) {
        stringIndex += graphemes[i]?.length ?? 0;
    }

    return stringIndex;
}

/** Index of the grapheme containing the given string index (the grapheme count at the end). */
export function stringToGraphemeIndex(text: string, stringIndex: number): number {
    const graphemes = getGraphemes(text);
    let currentStringIndex = 0;

    for (let i = 0; i < graphemes.length; i++) {
        if (currentStringIndex >= stringIndex) {
            return i;
        }

        currentStringIndex += graphemes[i]?.length ?? 0;
    }

    return graphemes.length;
}
