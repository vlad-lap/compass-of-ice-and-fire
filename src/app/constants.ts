import { GeodataDict, Language } from './models';

export const APP_TITLE = 'Compass of Ice and Fire';

export const AVAILABLE_LANGUAGES: Language[] = ['en', 'ru'];
export const DEFAULT_LANGUAGE: Language = 'en';

export const GEODATA_URLS: GeodataDict<string> = {
    continents: 'geodata/got_continents.geojson',
    kingdoms: 'geodata/got_political.geojson',
    lands: 'geodata/got_regions_land.geojson',
    islands: 'geodata/got_islands.geojson',
    mountains: 'geodata/got_mountain.geojson',
    volcanoes: 'geodata/got_volcanoes.geojson',
    snow: 'geodata/got_landscape_snow.geojson',
    steppes: 'geodata/got_landscape_steppe.geojson',
    wastelands: 'geodata/got_landscape_wasteland.geojson',
    deserts: 'geodata/got_landscape_desert.geojson',
    swamps: 'geodata/got_landscape_swamp.geojson',
    forests: 'geodata/got_landscape_forest.geojson',
    lakes: 'geodata/got_lakes.geojson',
    seas: 'geodata/got_regions_water.geojson',
    shores: 'geodata/got_regions_shore.geojson',
    vales: 'geodata/got_regions_vale.geojson',
    rivers: 'geodata/got_rivers.geojson',
    kingdomBorders: 'geodata/got_political_borders.geojson',
    roads: 'geodata/got_roads.geojson',
    theWall: 'geodata/got_wall.geojson',
    locations: 'geodata/got_locations.geojson',
    theFiveForts: 'geodata/got_five_forts.geojson',
};
