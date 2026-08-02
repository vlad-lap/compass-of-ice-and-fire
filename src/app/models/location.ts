export interface FeatureData {
    id: string;
    name: string;
    name_ru?: string;
    searchKeys?: string[];
}

export interface LocationData extends FeatureData {
    type?: string;
    type_ru?: string;
    size?: number;
    continentId?: string;
    islandId?: string;
    kingdomId?: string;
    regionId?: string;
    landscapeId?: string;
    description?: string;
    description_ru?: string;
    nameVariant?: string;
    nameVariant_ru?: string;
}

export type LocationType = 'cities' | 'towns' | 'settlements' | 'castles' | 'ruins' | 'other';
export type LocationTier = 'primary' | 'secondary' | 'tertiary';
export type LocationDict<T> = Partial<Record<LocationTier, T>>;
