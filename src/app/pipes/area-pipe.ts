import { Pipe, PipeTransform } from '@angular/core';
import { FeatureData } from '../models';
import { Store } from '@ngxs/store';
import { GeodataState, LanguagesState, UserSettingsState } from '../store';
import { uniq } from 'lodash';

@Pipe({
    name: 'area',
    pure: false,
})
export class AreaPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(location: FeatureData): string[] {
        const category = this.getCategoryName(location);
        const areaKeys: (keyof FeatureData)[] = [
            'islandId',
            category ? null : 'regionId',
            'countryId',
            (category || location.countryId || location.regionId) ? null : 'landscapeId',
            'kingdomId',
            location.kingdomId ? null : 'continentId',
        ];

        const areaParts = [
            category,
            ...areaKeys.map(key => this.featureNameById(location?.[key] as string)),
        ].filter(Boolean);
        return uniq(areaParts);
    }

    private getCategoryName(location: FeatureData): string {
        const language = this.store.selectSnapshot(UserSettingsState.language);
        return location?.[`category_${language}`] ?? location?.category;
    }

    private featureNameById(id: string): string {
        const feature = this.store.selectSnapshot(GeodataState.byId(id));
        const language = this.store.selectSnapshot(UserSettingsState.language);
        const name = feature?.properties[`name_${language}`] ?? feature?.properties.name;
        const ui = this.store.selectSnapshot(LanguagesState.coreUi);

        return feature?.properties.active === false ? `${name} (${ui.formerly})` : name;
    }
}
