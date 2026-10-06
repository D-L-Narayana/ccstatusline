import type { WidgetItem } from '../../types/Widget';
import type {
    SearchListEditorSpec,
    SearchListOption
} from '../../types/WidgetEditorSpec';
import {
    DEFAULT_RESET_LOCALE,
    canonicalizeLocale,
    filterLocaleOptions,
    getLocaleOptions,
    type LocaleOption
} from '../../utils/locales';

import {
    getUsageLocale,
    setUsageLocale
} from './usage-display';

export const LOCALE_EDITOR_ACTION = 'edit-locale';

function toSearchListOption(option: LocaleOption): SearchListOption {
    return {
        value: option.value,
        displayName: option.displayName,
        description: option.description
    };
}

// The option list is fixed for the item's configured locale; only filtering
// depends on the query. An unrecognised configured locale preselects the
// default option, and filterLocaleOptions synthesises a "Use <locale>" entry
// for valid locales typed into the search.
export function getUsageLocaleEditorSpec(item: WidgetItem): SearchListEditorSpec {
    const currentLocale = getUsageLocale(item);
    const options = getLocaleOptions(currentLocale);
    const canonicalCurrent = currentLocale ? canonicalizeLocale(currentLocale) : null;

    return {
        kind: 'search-list',
        title: 'Locale',
        currentLabel: currentLocale ?? DEFAULT_RESET_LOCALE,
        initialValue: canonicalCurrent ?? DEFAULT_RESET_LOCALE,
        emptyMessage: 'No locales match the search.',
        getOptions: query => filterLocaleOptions(options, query).map(toSearchListOption),
        commit: setUsageLocale
    };
}
