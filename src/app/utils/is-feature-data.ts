import { FeatureData } from '../models';

export function isFeatureData(value: unknown): value is FeatureData {
    return (
        typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value
    );
}