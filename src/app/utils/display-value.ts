import { FeatureData, Language, RoutePointValue } from '../models';
import { isFeatureData } from './is-feature-data';
import { startCase } from 'lodash';

export function getDisplayName(option: FeatureData, language: Language): string {
    return option?.[`name_${language}`] ?? option?.name
        ?? startCase(option?.[`type_${language}`] ?? option?.type);
}

export function getPointDisplayValue(point: RoutePointValue, language: Language): string {
    if (isFeatureData(point)) {
        return getDisplayName(point, language);
    }

    if (Array.isArray(point)) {
        return point.map(coord => coord.toFixed(6)).join(', ');
    }

    return point;
}
