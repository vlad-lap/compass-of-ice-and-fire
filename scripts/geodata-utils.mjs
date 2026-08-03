import { lineInPolygon, pointInPolygon } from './point-in-polygon.mjs';

export function filterGeodata(collection, filterFn) {
    if (!collection) {
        return null;
    }

    return {
        ...collection,
        features: collection.features.filter(filterFn),
    };
}

export function mapGeodata(collection, mapFn) {
    if (!collection) {
        return null;
    }

    return {
        ...collection,
        features: collection.features.map(mapFn),
    };
}

export function addContinentId(feature, continents) {
    const continent = continents.features.find(
        ({ properties }) => properties.name === feature.properties.continent,
    );
    const continentId = continent?.properties.id ?? null;
    const properties = { ...feature.properties, continentId };
    return { ...feature, properties };
}

export function findPolygonContaining(geometry, collection) {
    switch (geometry.type) {
        case 'Point':
            return collection.features.find(feature =>
                pointInPolygon(geometry.coordinates, feature.geometry),
            );
        case 'LineString':
        case 'MultiLineString':
            return collection.features.find(feature => lineInPolygon(geometry, feature.geometry));
    }
}

export function getContainingPolygonId(geometry, collection) {
    const polygon = findPolygonContaining(geometry, collection);
    return polygon?.properties.id ?? null;
}

export function getLocationContinentId(geometry, continents, islands) {
    const continent = findPolygonContaining(geometry, continents);
    const island = findPolygonContaining(geometry, islands);
    return continent?.properties.id ?? island?.properties.continentId ?? null;
}
