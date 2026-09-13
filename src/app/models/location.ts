export interface FeatureData {
    id: string;
    name: string;
    type?: string;
    size?: number;
    description?: string;
    nameVariant?: string;
    category?: string;
    ClaimedBy?: string;
    isPort?: boolean;
    searchKeys?: string[];
    active?: boolean;
    continentId?: string;
    islandId?: string;
    kingdomId?: string;
    countryId?: string;
    regionId?: string;
    landscapeId?: string;

    name_ru?: string;
    type_ru?: string;
    description_ru?: string;
    nameVariant_ru?: string;
    category_ru?: string;
    ClaimedBy_ru?: string;
}

export type LocationType = 'city' | 'settlement' | 'castle' | 'ruin' | 'other';
export type LocationTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';
export type LocationDict<T> = Partial<Record<LocationTier, T>>;
