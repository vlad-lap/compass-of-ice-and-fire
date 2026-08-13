import { FeatureData, Language } from '../models';

export function localizeProperty<T extends FeatureData>(feature: T, language: Language, property: keyof T): string {
    return feature?.[`${property as string}_${language}`] ?? (feature?.[property] as string);
}