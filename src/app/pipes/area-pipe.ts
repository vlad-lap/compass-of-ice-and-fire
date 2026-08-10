import { Pipe, PipeTransform } from '@angular/core';
import { FeatureData } from '../models';
import { Store } from '@ngxs/store';
import { GeodataState, LanguagesState } from '../store';
import { uniq } from 'lodash';

@Pipe({
    name: 'area',
    pure: false,
})
export class AreaPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(location: FeatureData): string[] {
        const areaKeys: (keyof FeatureData)[] = [
            'islandId',
            'regionId',
            'countryId',
            (location.countryId || location.regionId) ? null : 'landscapeId',
            'kingdomId',
            location.kingdomId ? null : 'continentId',
        ];

        const areaParts = areaKeys.map(key => this.featureNameById(location?.[key] as string)).filter(Boolean);
        return uniq(areaParts);
    }

    private featureNameById(id: string): string {
        const feature = this.store.selectSnapshot(GeodataState.byId(id));
        const language = this.store.selectSnapshot(LanguagesState.language);
        const name = feature?.properties[`name_${language}`] ?? feature?.properties.name;
        const ui = this.store.selectSnapshot(LanguagesState.coreUi);

        return feature?.properties.active === false ? `${name} (${ui.formerly})` : name;
    }
}
