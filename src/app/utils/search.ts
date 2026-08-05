import { FeatureCollection } from 'geojson';
import { FeatureData, LocationData } from '../models';
import { flatten, groupBy, uniq, uniqBy } from 'lodash';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from '../constants';

function buildSearchKeys(name: string): string[] {
    if (!name) {
        return [];
    }
    const normalized = name.toLowerCase().trim();
    return uniq([
        normalized,
        normalized.replace(/'/g, ''),
        normalized.replace(/-/g, ' '),
        normalized.replace(/\(/g, '').replace(/\)/g, ''),
    ]);
}

function buildLocalizedSearchKeys(feature: FeatureData): string[] {
    const nameKeys = [
        'name',
        ...AVAILABLE_LANGUAGES
            .filter(lang => lang !== DEFAULT_LANGUAGE)
            .map(lang => `name_${lang}`),
    ];

    return flatten(nameKeys.map(key => buildSearchKeys(feature[key])));
}

export function getSearchOptions({ features }: FeatureCollection): FeatureData[] {
    const options = features
        .filter(({ properties }) => !!properties?.name)
        .map(({ properties }) => ({
            ...properties as FeatureData,
            searchKeys: buildLocalizedSearchKeys(properties as FeatureData),
        }));

    return uniqBy(options, 'id');
}

export function getLocationsSearchOptions({
    features,
}: FeatureCollection): Record<string, LocationData[]> {
    const locations: LocationData[] = features
        .filter(({ properties }) => !!properties?.name)
        .map(({ properties }) => ({
            ...properties as LocationData,
            searchKeys: buildLocalizedSearchKeys(properties as LocationData),
        }));

    const uniqueLocations = uniqBy(locations, 'id');

    return groupBy(uniqueLocations, 'type');
}

export function matchesSearch(searchKeys: string[], query: string): boolean {
    const queryWords = query.toLowerCase().trim().split(/\s+/);

    return searchKeys.some(searchKey => {
        const nameWords = searchKey.split(/\s+/);
        const nameStartIndex = nameWords.findIndex(word => word.startsWith(queryWords[0]));

        if (queryWords.length === 1) {
            return nameStartIndex !== -1;
        }

        return (
            queryWords.length <= nameWords.length &&
            nameStartIndex !== -1 &&
            queryWords.every((queryWord, i, ) => nameWords[nameStartIndex + i]?.startsWith(queryWord))
        );
    });
}
