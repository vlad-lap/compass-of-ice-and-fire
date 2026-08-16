import { Feature, FeatureCollection, Point } from 'geojson';
import { FeatureData } from '../models';
import { getLocationsSearchOptions, getSearchOptions, matchesSearch } from './search';

function featureWith(properties: Partial<FeatureData>): Feature<Point> {
    return {
        type: 'Feature',
        properties: properties as FeatureData,
        geometry: { type: 'Point', coordinates: [0, 0] },
    };
}

describe('getSearchOptions', () => {
    it('drops features without a name', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [featureWith({ id: '1' })],
        };
        expect(getSearchOptions(collection)).toEqual([]);
    });

    it('deduplicates features by id', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [
                featureWith({ id: '1', name: 'Winterfell' }),
                featureWith({ id: '1', name: 'Winterfell' }),
            ],
        };
        expect(getSearchOptions(collection)).toHaveLength(1);
    });

    it('builds search keys from name and name_ru', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [featureWith({ id: '1', name: "King's Landing", name_ru: 'Королевская Гавань' })],
        };

        const [option] = getSearchOptions(collection);

        expect(option.searchKeys).toContain("king's landing");
        expect(option.searchKeys).toContain('kings landing');
        expect(option.searchKeys).toContain('королевская гавань');
    });

    it('builds search keys with hyphens replaced by spaces', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [featureWith({ id: '1', name: 'Eastwatch-by-the-Sea' })],
        };

        const [option] = getSearchOptions(collection);

        expect(option.searchKeys).toContain('eastwatch-by-the-sea');
        expect(option.searchKeys).toContain('eastwatch by the sea');
    });

    it('builds search keys with ё normalized to е', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [featureWith({ id: '1', name: 'Castle Black', name_ru: 'Чёрный Замок' })],
        };

        const [option] = getSearchOptions(collection);

        expect(option.searchKeys).toContain('чёрный замок');
        expect(option.searchKeys).toContain('черный замок');
    });

    it('builds search keys with parentheses removed', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [featureWith({ id: '1', name: 'Vaes Khewo (Sarnath)' })],
        };

        const [option] = getSearchOptions(collection);

        expect(option.searchKeys).toContain('vaes khewo (sarnath)');
        expect(option.searchKeys).toContain('vaes khewo sarnath');
    });
});

describe('getLocationsSearchOptions', () => {
    it('groups deduplicated features by type', () => {
        const collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [
                featureWith({ id: '1', name: 'Winterfell', type: 'castle' }),
                featureWith({ id: '2', name: "King's Landing", type: 'city' }),
                featureWith({ id: '1', name: 'Winterfell', type: 'castle' }),
            ],
        };

        const grouped = getLocationsSearchOptions(collection);

        expect(grouped['castle']).toHaveLength(1);
        expect(grouped['city']).toHaveLength(1);
    });
});

describe('matchesSearch', () => {
    it('matches a single-word prefix', () => {
        expect(matchesSearch(['winterfell'], 'wint')).toBe(true);
        expect(matchesSearch(['winterfell'], 'summer')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(matchesSearch(['winterfell'], 'WINT')).toBe(true);
    });

    it('matches multi-word queries in order', () => {
        expect(matchesSearch(['kings landing'], 'kings land')).toBe(true);
        expect(matchesSearch(['kings landing'], 'land kings')).toBe(false);
    });

    it('requires the query to have no more words than the name', () => {
        expect(matchesSearch(['winterfell'], 'winterfell castle')).toBe(false);
    });
});
