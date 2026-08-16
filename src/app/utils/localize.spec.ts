import { FeatureData } from '../models';
import { localizeProperty } from './localize';

describe('localizeProperty', () => {
    const feature: Partial<FeatureData> = { name: 'Winterfell', name_ru: 'Винтерфелл' };

    it('returns the localized value when present', () => {
        expect(localizeProperty(feature as FeatureData, 'ru', 'name')).toBe('Винтерфелл');
    });

    it('falls back to the base property when there is no localized value', () => {
        expect(localizeProperty(feature as FeatureData, 'en', 'name')).toBe('Winterfell');
    });

    it('falls back to the base property when the localized value is missing entirely', () => {
        const noRussian: Partial<FeatureData> = { name: 'Casterly Rock' };
        expect(localizeProperty(noRussian as FeatureData, 'ru', 'name')).toBe('Casterly Rock');
    });

    it('returns undefined when the feature is falsy', () => {
        expect(localizeProperty(null as unknown as FeatureData, 'ru', 'name')).toBeUndefined();
    });
});
