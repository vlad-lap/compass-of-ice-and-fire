export type PolygonGeodataType =
    | 'continents'
    | 'kingdoms'
    | 'countries'
    | 'regions'
    | 'shores'
    | 'vales'
    | 'islands'
    | 'mountains'
    | 'mountainRidges'
    | 'forests'
    | 'snow'
    | 'steppes'
    | 'deserts'
    | 'wastelands'
    | 'swamps'
    | 'lakes'
    | 'seas'
    | 'bays'
    | 'straits'
    | 'detail';

export type LineGeodataType = 'rivers' | 'kingdomBorders' | 'roads' | 'streets' | 'theWall';

export type PointGeodataType = 'locations' | 'theFiveForts' | 'volcanoes';

export type GeodataType = PolygonGeodataType | LineGeodataType | PointGeodataType;

export type GeodataDict<T> = Partial<Record<GeodataType, T>>;
