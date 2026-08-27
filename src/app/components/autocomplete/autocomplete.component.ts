import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    viewChild,
    ViewEncapsulation,
} from '@angular/core';
import { KeyValue, KeyValuePipe } from '@angular/common';
import { LocalizePipe, SortSearchOptionsPipe } from '../../pipes';
import { MatAutocomplete, MatOptgroup, MatOption } from '@angular/material/autocomplete';
import { FeatureData, OptionGroup, RoutePointValue } from '../../models';
import { getPointDisplayValue, isFeatureData, matchesSearch } from '../../utils';
import { Store } from '@ngxs/store';
import { GeodataState, HISTORY_STATE_TOKEN, LanguagesState, UserSettingsState } from '../../store';
import { RECENT } from '../../constants';
import { findKey, isEmpty, mapValues, omitBy, pick } from 'lodash';
import { MatIcon } from '@angular/material/icon';

const OPTIONS_GROUP_ORDER: OptionGroup[] = [
    RECENT,

    'city',
    'castle',
    'ruin',
    'settlement',
    'other',

    'theWall',
    'theFiveForts',
    'kingdoms',
    'countries',
    'regions',
    'roads',

    'continents',
    'islands',
    'seas',
    'rivers',
    'lakes',
    'bays',
    'straits',
    'mountains',
    'steppes',
    'forests',
    'shores',
    'vales',
    'swamps',
    'deserts',
    'wastelands',
];

@Component({
    selector: 'coiaf-autocomplete',
    exportAs: 'autocomplete',
    imports: [
        KeyValuePipe,
        LocalizePipe,
        MatAutocomplete,
        MatOptgroup,
        MatOption,
        SortSearchOptionsPipe,
        MatIcon,
    ],
    templateUrl: './autocomplete.component.html',
    styleUrl: './autocomplete.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class AutocompleteComponent {
    readonly query = input<RoutePointValue>();
    readonly availableGroups = input<OptionGroup[]>(OPTIONS_GROUP_ORDER);
    readonly excludedIds = input<string[]>([]);

    readonly matAutocomplete = viewChild(MatAutocomplete);

    readonly optionGroups = this.store.selectSignal(LanguagesState.optionGroups);
    readonly language = this.store.selectSignal(UserSettingsState.language);
    readonly options = this.store.selectSnapshot(GeodataState.searchOptions);

    readonly queryStr = computed<string>(() => {
        const query = this.query();
        if (isFeatureData(query)) {
            return query.name;
        }

        if (Array.isArray(query)) {
            return '';
        }

        return query ?? '';
    });

    readonly filteredOptions = computed<Record<string, FeatureData[]>>(() => {
        const query = this.query();
        const availableGroups = this.availableGroups();
        const excludedIds = this.excludedIds();

        const recent = this.store
            .selectSnapshot(HISTORY_STATE_TOKEN)
            .filter(feature => this.isAvailable(feature));

        const allOptions = pick({ recent, ...this.options }, availableGroups);
        const filteredOptions = mapValues(allOptions, (features, group) =>
            features.filter(
                feature =>
                    this.matchesQuery(feature) &&
                    !excludedIds.includes(feature.id) &&
                    (group === RECENT || !!query),
            ),
        );

        return omitBy(filteredOptions, isEmpty);
    });

    get isOpen(): boolean {
        return this.matAutocomplete().isOpen;
    }

    constructor(private store: Store) {}

    displayFn = (feature: RoutePointValue) => getPointDisplayValue(feature, this.language());

    sortOptionsGroup(
        { key: key1 }: KeyValue<OptionGroup, FeatureData[]>,
        { key: key2 }: KeyValue<OptionGroup, FeatureData[]>,
    ): number {
        return OPTIONS_GROUP_ORDER.indexOf(key1) - OPTIONS_GROUP_ORDER.indexOf(key2);
    }

    private matchesQuery({ searchKeys }: FeatureData): boolean {
        const query = this.queryStr();
        return matchesSearch(searchKeys, query ?? '');
    }

    private isAvailable({ id }: FeatureData): boolean {
        const group = findKey(this.options, options =>
            options.some(o => o.id === id),
        ) as OptionGroup;

        return this.availableGroups().includes(group);
    }
}
