import { Pipe, PipeTransform } from '@angular/core';
import { FeatureData } from '../models';
import { Store } from '@ngxs/store';
import { UserSettingsState } from '../store';
import { localizeProperty } from '../utils';

@Pipe({
    name: 'localize',
    pure: false,
})
export class LocalizePipe implements PipeTransform {
    constructor(private store: Store) {}

    transform<T extends FeatureData>(feature: T, property: keyof T): string {
        const language = this.store.selectSnapshot(UserSettingsState.language);
        return localizeProperty(feature, language, property);
    }
}
