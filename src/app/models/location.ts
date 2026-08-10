export interface FeatureData {
    id: string;
    name: string;
    name_ru?: string;
    searchKeys?: string[];
    category?: string;
    category_ru?: string;
    active?: boolean;
    type?: string;
    type_ru?: string;
    size?: number;
    continentId?: string;
    islandId?: string;
    kingdomId?: string;
    countryId?: string;
    regionId?: string;
    landscapeId?: string;
    description?: string;
    description_ru?: string;
    nameVariant?: string;
    nameVariant_ru?: string;
    ClaimedBy?: string;
}

export type LocationType = 'city' | 'settlement' | 'castle' | 'ruin' | 'other';
export type LocationTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';
export type LocationDict<T> = Partial<Record<LocationTier, T>>;
