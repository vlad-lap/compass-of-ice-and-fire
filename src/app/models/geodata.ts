export type PolygonGeodataType =
    'continents'
    | 'kingdoms'
    | 'lands'
    | 'shores'
    | 'islands'
    | 'mountains'
    | 'mountainRidges'
    | 'forests'
    | 'snow'
    | 'deserts'
    | 'wastelands'
    | 'swamps'
    | 'lakes'
    | 'seas';

export type LineGeodataType = 'rivers' | 'kingdomBorders' | 'roads' | 'wall';

export type PointGeodataType = 'locations' | 'volcanoes';

export type GeodataType = PolygonGeodataType | LineGeodataType | PointGeodataType;

export type GeodataDict<T> = Partial<Record<GeodataType, T>>;
