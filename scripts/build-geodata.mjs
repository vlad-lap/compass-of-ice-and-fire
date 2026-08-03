import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { splitByType } from './split-by-type.mjs';
import { addContinentId, filterGeodata, getContainingPolygonId, getLocationContinentId, mapGeodata } from './geodata-utils.mjs';
import { generateIds } from './generate-ids.mjs';
import { buildKingdomBorders } from './build-kingdom-borders.mjs';
import { buildMountainRidges, buildMountainUnion } from './build-mountain-ridges.mjs';
import { readJSON, writeJSON } from './json-utils.mjs';
import {
    addLanguageProperties,
    syncDictionary,
    syncLanguageDict,
} from './language.mjs';
import { getConsolePrefix, getConsoleStats } from './console-utils.mjs';
import { getCentralPoint } from './geometry-utils.mjs';

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
        console.log(`${getPrefix('descriptions')} ${getConsoleStats(withDescriptions.length, named.length)}`);
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

const continents = processGeoJSON('got_continents.geojson', 'continents.json');

const islands = processGeoJSON('got_islands.geojson', 'islands.json', {
    mapFn: feature => addContinentId(feature, continents)
});
const kingdoms = processGeoJSON('got_political.geojson', 'kingdoms.json');

const borders = buildKingdomBorders(kingdoms, continents, islands);
writeGeoJSON('got_political_borders.geojson', borders);

const mountains = readGeoJSON('got_mountains.geojson', 'mountains.json');
const mountainRidges = buildMountainRidges(mountains, continents, islands);
writeGeoJSON('got_mountain_ridges.geojson', mountainRidges);

const mountainUnion = buildMountainUnion(mountainRidges);
writeGeoJSON('got_mountain.geojson', mountainUnion);
syncLanguage(mountains, 'mountains.json');

processGeoJSON('got_lakes.geojson', 'lakes.json');
processGeoJSON('got_rivers.geojson', 'rivers.json');
processGeoJSON('got_roads.geojson', 'roads.json');
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
        const centroid = { type: 'Point', coordinates };

        return {
            ...feature,
            properties: {
                ...feature.properties,
                centerLng: coordinates[0],
                centerLat: coordinates[1],
                continentId: getLocationContinentId(centroid, continents, islands),
            }
        }
    }
});
const { land } = splitAndProcess('got_regions.geojson', 'regions.json');

function getContainingLandscapeId(feature) {
    return Object.values(landscape)
        .map(collection => getContainingPolygonId(feature.geometry, collection))
        .find(Boolean);
}

const descriptions = readJSON(join(DATA, 'descriptions.json'));
const nameVariants = readJSON(join(DATA, 'name-variants.json'));

const theWall = processGeoJSON('got_wall.geojson', 'the-wall.json', {
    mapFn: feature => ({
        ...feature,
        properties: {
            ...feature.properties,
            continentId: getLocationContinentId(feature.geometry, continents, islands),
            kingdomId: getContainingPolygonId(feature.geometry, kingdoms),
            regionId: getContainingPolygonId(feature.geometry, land),
            landscapeId: getContainingLandscapeId(feature),
            islandId: getContainingPolygonId(feature.geometry, islands),
            description: descriptions[feature.properties.id] ?? null,
        },
    }),
});

const locations = processGeoJSON('got_locations.geojson', 'locations.json', {
    mapFn: feature => ({
        ...feature,
        properties: {
            ...feature.properties,
            continentId: getLocationContinentId(feature.geometry, continents, islands),
            kingdomId: getContainingPolygonId(feature.geometry, kingdoms),
            regionId: getContainingPolygonId(feature.geometry, land),
            landscapeId: getContainingLandscapeId(feature),
            islandId: getContainingPolygonId(feature.geometry, islands),
            description: descriptions[feature.properties.id] ?? null,
            nameVariant: nameVariants[feature.properties.id] ?? null,
        },
    }),
});

const wallData = getFeatureProperties(theWall);
const locationsData = getFeatureProperties(locations);
syncDictionary([...wallData, ...locationsData], 'description');
syncDictionary(locationsData, 'nameVariant', false);



