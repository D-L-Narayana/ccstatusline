import type { WidgetItem } from '../../types/Widget';
import type {
    SearchListEditorSpec,
    SearchListOption
} from '../../types/WidgetEditorSpec';
import {
    filterTimezoneOptions,
    getTimezoneOptions,
    type TimezoneOption
} from '../../utils/timezones';

import {
    getUsageTimezone,
    setUsageTimezone
} from './usage-display';

export const TIMEZONE_EDITOR_ACTION = 'edit-timezone';

const DEFAULT_TIMEZONE = 'UTC';

function toSearchListOption(option: TimezoneOption): SearchListOption {
    return {
        value: option.value,
        displayName: option.displayName,
        description: option.description
    };
}

// The option list is fixed for the item's configured timezone; only filtering
// depends on the query. A configured zone the runtime does not know is shown
// as the current label but preselects UTC, since it has no row to select.
export function getUsageTimezoneEditorSpec(item: WidgetItem): SearchListEditorSpec {
    const currentTimezone = getUsageTimezone(item);
    const options = getTimezoneOptions(currentTimezone);
    const currentOption = options.find(option => option.value === currentTimezone);

    return {
        kind: 'search-list',
        title: 'Timezone',
        currentLabel: currentTimezone ?? DEFAULT_TIMEZONE,
        initialValue: currentOption?.value ?? DEFAULT_TIMEZONE,
        emptyMessage: 'No timezones match the search.',
        getOptions: query => filterTimezoneOptions(options, query).map(toSearchListOption),
        commit: setUsageTimezone
    };
}
