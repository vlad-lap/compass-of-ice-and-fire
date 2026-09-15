import { Pipe, PipeTransform } from '@angular/core';
import { FeatureData } from '../models';
import { Store } from '@ngxs/store';
import { GeodataState, LanguagesState, UserSettingsState } from '../store';

interface AreaPart {
    id: string;
    name: string;
    hasCard: boolean;
}

@Pipe({
    name: 'area',
    pure: false,
})
export class AreaPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(location: FeatureData): AreaPart[] {
        const category = this.getCategoryName(location);
        const areaKeys: (keyof FeatureData)[] = [
            'islandId',
            category ? null : 'regionId',
            'countryId',
            (category || location.countryId || location.regionId) ? null : 'landscapeId',
            'kingdomId',
            location.kingdomId ? null : 'continentId',
        ];

        return [
            { id: null, name: category, hasCard: false },
            ...areaKeys.map(key => {
                const id = location?.[key] as string;
                return {
                    id,
                    name: this.featureNameById(id),
                    hasCard: this.hasCard(id),
                };
            }),
        ].filter((part, _, area) =>
            !!part.name && !this.isDuplicatePart(part, area)
        );
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

    private hasCard(id: string): boolean {
        const feature = this.store.selectSnapshot(GeodataState.byId(id));
        return !!feature?.properties.description || !!feature?.properties.ClaimedBy;
    }

    private isDuplicatePart(part: AreaPart, area: AreaPart[]): boolean {
        const duplicate = area.find(p => p.id !== part.id && p.name === part.name);
        return !part.hasCard && !!duplicate;
    }
}
