import { Pipe, PipeTransform } from '@angular/core';
import { FeatureData } from '../models';
import { sortBy } from 'lodash';
import { localizeProperty } from '../utils';
import { Store } from '@ngxs/store';
import { UserSettingsState } from '../store';
import { RECENT } from '../constants';

@Pipe({
    name: 'sortSearchOptions',
})
export class SortSearchOptionsPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(options: FeatureData[], optionGroup: string): FeatureData[] {
        if (!options) {
            return [];
        }

        if (optionGroup === RECENT) {
            return options;
        }

        const language = this.store.selectSnapshot(UserSettingsState.language);

        return sortBy(options, [
            option => (option.size ? -option.size : 0),
            option => localizeProperty(option, language, 'name'),
        ]);
    }
}
