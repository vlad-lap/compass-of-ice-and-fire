import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { splitByType } from './split-by-type.mjs';
import { addContinentId, filterGeodata, getContainingPolygonId, getLocationContinentId, mapGeodata } from './geodata-utils.mjs';
import { generateIds } from './generate-ids.mjs';
import { buildKingdomBorders } from './build-kingdom-borders.mjs';
import { buildMountainRidges, buildMountainUnion } from './build-mountain-ridges.mjs';
import { buildRoadNetwork } from './build-road-network.mjs';
import { buildBarrierCrossings } from './build-barrier-crossings.mjs';
import { readJSON, writeJSON } from './json-utils.mjs';
import {
    addFeatureLanguageProperties,
    addLanguageProperties,
    syncDictionary,
    syncLanguageDict,
} from './language.mjs';
import { getConsolePrefix, getConsoleStats } from './console-utils.mjs';
import { getCentralPoint, getInteriorPoint, getMiddleMultiPoint } from './geometry-utils.mjs';
import { getCategory } from './get-category.mjs';
import { LOCATION_LABEL_ANCHORS } from './constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QGIS = join(__dirname, '..', 'qgis');
const GEODATA = join(__dirname, '..', 'geodata');
const DATA = join(__dirname, '..', 'data');
const RAW_DATA = join(DATA, 'raw');

function readGeoJSON(fileName, languageFileName) {
    const collection = readJSON(join(QGIS, fileName), 'utf8');
    const collectionWithIds = generateIds(collection);
    return languageFileName
        ? addLanguageProperties(collectionWithIds, languageFileName)
        : collectionWithIds;
}

function writeGeoJSON(fileName, collection) {
    writeJSON(join(GEODATA, fileName), collection);
    const prefix = getConsolePrefix('geodata', fileName)
    console.log(`${prefix} ${collection.features.length} features`);
}

function getFeatureProperties(collection) {
    return collection.features.map(feature => feature.properties);
}

function writeRawDataJSON(fileName, collection) {
    const dataItems = getFeatureProperties(collection);
    writeJSON(join(RAW_DATA, fileName), dataItems);
    const named = dataItems.filter(item => !!item.name);
    const withDescriptions = dataItems.filter(item => !!item.description);
    const translated = dataItems.filter(item => !!item.name_ru);

    const getPrefix = category => getConsolePrefix(category, fileName);

    console.log(
        `${getPrefix('data')} ${dataItems.length} features, ${named.length} named`,
    );
    console.log(`${getPrefix('translations')} ${getConsoleStats(translated.length, named.length)}`);

    const hasDescriptions = dataItems.some(item => item.description !== undefined);
    if (hasDescriptions) {
        const shouldHaveDescriptions = named.filter(item => item.description !== undefined);
        console.log(`${getPrefix('descriptions')} ${getConsoleStats(withDescriptions.length, shouldHaveDescriptions.length)}`);
    }

    return dataItems;
}

function syncLanguage(collection, languageFileName) {
    const rawData = writeRawDataJSON(languageFileName, collection);
    syncLanguageDict(rawData, languageFileName);
}

function processGeoJSON(fileName, languageFileName = null, { filterFn, mapFn } = {}) {
    const collection = readGeoJSON(fileName, languageFileName);
    const filtered = filterFn ? filterGeodata(collection, filterFn) : collection;
    const mapped = mapFn ? mapGeodata(filtered, mapFn) : filtered;
    writeGeoJSON(fileName, mapped);

    if (languageFileName) {
        syncLanguage(mapped, languageFileName);
    }

    return mapped;
}

mkdirSync(GEODATA, { recursive: true });
mkdirSync(RAW_DATA, { recursive: true });

const descriptions = readJSON(join(DATA, 'descriptions.json'));
const nameVariants = readJSON(join(DATA, 'name-variants.json'));

const continents = processGeoJSON('got_continents.geojson', 'continents.json');

const islands = processGeoJSON('got_islands.geojson', 'islands.json', {
    mapFn: feature => addContinentId(feature, continents)
});
const kingdoms = processGeoJSON('got_political.geojson', 'kingdoms.json', {
    // TODO add language properties while writing, not reading, to avoid such duplicate calls
    mapFn: feature => addFeatureLanguageProperties({
        ...feature,
        properties: {
            ...feature.properties,
            type: 'kingdom',
            description: descriptions[feature.properties.id] ?? null,
        },
    }, 'kingdoms.json'),
});

const borders = buildKingdomBorders(kingdoms, continents, islands);
writeGeoJSON('got_political_borders.geojson', borders);

const mountains = readGeoJSON('got_mountains.geojson', 'mountains.json');
const mountainRidges = buildMountainRidges(mountains, continents, islands);
writeGeoJSON('got_mountain_ridges.geojson', mountainRidges);

const mountainUnion = buildMountainUnion(mountainRidges, continents, islands);
writeGeoJSON('got_mountain.geojson', mountainUnion);
syncLanguage(mountains, 'mountains.json');

processGeoJSON('got_lakes.geojson', 'lakes.json');
const rivers = processGeoJSON('got_rivers.geojson', 'rivers.json');
const roads = processGeoJSON('got_roads.geojson', 'roads.json');

const roadNetwork = buildRoadNetwork(roads);
writeJSON(join(GEODATA, 'road-network.json'), roadNetwork);
console.log(`${getConsolePrefix('geodata', 'road-network.json')} ${roadNetwork.nodes.length} nodes, ${roadNetwork.edges.length} edges, ${new Set(roadNetwork.nodeGroups).size} groups`);
processGeoJSON('got_volcanoes.geojson', null, {
    mapFn: feature => ({
        ...feature,
        properties: {
            ...feature.properties,
            smokeRadius: Math.floor(Math.random() * 3),
        },
    }),
});

function splitAndProcess(fileName, languageFileName, { filterFn, mapFn } = {}) {
    const unsplitted = readGeoJSON(fileName, languageFileName);
    const filtered = filterFn ? filterGeodata(unsplitted, filterFn) : unsplitted;
    const mapped = mapFn ? mapGeodata(filtered, mapFn) : filtered;
    syncLanguage(mapped, languageFileName);

    const byType = splitByType(mapped);

    for (const [type, collection] of Object.entries(byType)) {
        const [name, extension] = fileName.split('.');
        writeGeoJSON(`${name}_${type.toLowerCase()}.${extension}`, collection);
    }

    return byType;
}

const landscape = splitAndProcess('got_landscape.geojson', 'landscape.json', {
    mapFn: feature => {
        const coordinates = getCentralPoint(feature.geometry);
        const interiorPoint = { type: 'Point', coordinates: getInteriorPoint(feature.geometry) };

        return {
            ...feature,
            properties: {
                ...feature.properties,
                centerLng: coordinates[0],
                centerLat: coordinates[1],
                continentId: getLocationContinentId(interiorPoint, continents, islands),
            }
        }
    }
});
const { country, region } = splitAndProcess('got_regions.geojson', 'regions.json', {
    mapFn: feature => {
        const interiorPoint = { type: 'Point', coordinates: getInteriorPoint(feature.geometry) };

        return {
            ...feature,
            properties: {
                ...feature.properties,
                continentId: getLocationContinentId(interiorPoint, continents, islands),
                kingdomId: getContainingPolygonId(interiorPoint, kingdoms),
                description: ['country', 'region'].includes(feature.properties.type)
                    ? (descriptions[feature.properties.id] ?? null)
                    : undefined,
            },
        };
    },
});

function getContainingLandscapeId(feature) {
    return Object.values(landscape)
        .map(collection => getContainingPolygonId(feature.geometry, collection))
        .find(Boolean);
}

const theWall = processGeoJSON('got_wall.geojson', 'the-wall.json', {
    mapFn: feature => ({
        ...feature,
        properties: {
            ...feature.properties,
            continentId: getLocationContinentId(feature.geometry, continents, islands),
            kingdomId: getContainingPolygonId(feature.geometry, kingdoms),
            countryId: getContainingPolygonId(feature.geometry, country),
            regionId: getContainingPolygonId(feature.geometry, region),
            landscapeId: getContainingLandscapeId(feature),
            islandId: getContainingPolygonId(feature.geometry, islands),
            description: descriptions[feature.properties.id] ?? null,
        },
    }),
});

const theFiveForts = processGeoJSON('got_five_forts.geojson', 'the-five-forts.json', {
    mapFn: feature => {
        const middlePoint = getMiddleMultiPoint(feature.geometry);
        const geometry = { type: 'Point', coordinates: middlePoint };
        return {
            ...feature,
            properties: {
                ...feature.properties,
                continentId: getLocationContinentId(geometry, continents, islands),
                kingdomId: getContainingPolygonId(geometry, kingdoms),
                countryId: getContainingPolygonId(geometry, country),
                regionId: getContainingPolygonId(geometry, region),
                islandId: getContainingPolygonId(geometry, islands),
                description: descriptions[feature.properties.id] ?? null,
                nameVariant: nameVariants[feature.properties.id] ?? null,
            },
        };
    },
});

const locations = processGeoJSON('got_locations.geojson', 'locations.json', {
    mapFn: feature => {
        const category = getCategory(feature);

        return {
            ...feature,
            properties: {
                ...feature.properties,
                category: category?.name ?? null,
                continentId: getLocationContinentId(feature.geometry, continents, islands),
                kingdomId: getContainingPolygonId(feature.geometry, kingdoms),
                countryId: category?.id === 'rhoynar-cities'
                    ? null
                    : getContainingPolygonId(feature.geometry, country),
                regionId: getContainingPolygonId(feature.geometry, region),
                landscapeId: getContainingLandscapeId(feature),
                islandId: getContainingPolygonId(feature.geometry, islands),
                description: descriptions[feature.properties.id] ?? null,
                nameVariant: nameVariants[feature.properties.id] ?? null,
                labelAnchor: LOCATION_LABEL_ANCHORS[feature.properties.id],
            },
        };
    },
});

const barrierCrossings = buildBarrierCrossings(roads, rivers, theWall, locations);
writeJSON(join(GEODATA, 'barrier-crossings.json'), barrierCrossings);
const countByKind = kind => barrierCrossings.crossings.filter(crossing => crossing.kind === kind).length;
console.log(`${getConsolePrefix('geodata', 'barrier-crossings.json')} ${barrierCrossings.crossings.length} crossings `
    + `(${countByKind('bridge')} bridges, ${countByKind('location')} on locations, ${countByKind('gate')} Wall gates)`);

const wallData = getFeatureProperties(theWall);
const fiveFortsData = getFeatureProperties(theFiveForts);
const locationsData = getFeatureProperties(locations);
const kingdomsData = getFeatureProperties(kingdoms);
const countriesData = getFeatureProperties(country);
const regionsData = getFeatureProperties(region);

syncDictionary(
    [
        ...wallData,
        ...fiveFortsData,
        ...locationsData,
        ...kingdomsData,
        ...countriesData,
        ...regionsData,
    ],
    'description',
);
syncDictionary(locationsData, 'nameVariant', false);



