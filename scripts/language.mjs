import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from './constants.mjs';
import { readJSON, writeJSON } from './json-utils.mjs';
import { mapGeodata } from './geodata-utils.mjs';
import { getConsolePrefix } from './console-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const LANGUAGES = join(__dirname, '..', 'languages');

export function addFeatureLanguageProperties(feature, namesFileName) {
    const properties = AVAILABLE_LANGUAGES
        .filter(lang => lang !== DEFAULT_LANGUAGE)
        .reduce((props, lang) => {
            const namesDict = readJSON(join(LANGUAGES, lang, namesFileName));
            const typesDict = readJSON(join(LANGUAGES, lang, 'types.json'));
            const descriptionsDict = readJSON(join(LANGUAGES, lang, 'descriptions.json'));

            return {
                ...props,
                [`name_${lang}`]: namesDict[feature.properties.id] ?? null,
                [`description_${lang}`]: descriptionsDict[feature.properties.id] ?? null,
                ...(feature.properties.type
                    ? { [`type_${lang}`]: typesDict[feature.properties.type] ?? null }
                    : {}
                )
            };
            
        }, feature.properties);

    return { ...feature, properties };
}

export function addLanguageProperties(collection, namesFileName) {
    return mapGeodata(collection, feature => addFeatureLanguageProperties(feature, namesFileName));
}

export function syncLanguageDict(dataItems, fileName) {
    AVAILABLE_LANGUAGES.filter(lang => lang !== DEFAULT_LANGUAGE).forEach(lang => {
        const dict = dataItems
            .filter(({ name }) => !!name)
            .reduce(
                (dict, item) => ({
                    ...dict,
                    [item.id]: item[`name_${lang}`],
                }),
                {},
            );

        writeJSON(join(LANGUAGES, lang, fileName), dict);
    });
}

export function syncDescriptions(dataItems) {
    AVAILABLE_LANGUAGES.forEach(lang => {
        const descriptionKey = lang === DEFAULT_LANGUAGE ? 'description' : `description_${lang}`;
        const descriptionsDict = dataItems
            .filter(({ name }) => !!name)
            .reduce(
                (dict, dataItem) => ({
                    ...dict,
                    [dataItem.id]: dataItem[descriptionKey],
                }),
                {},
            );
        const dictFileName = 'descriptions.json';
        const dictPath =
            lang === DEFAULT_LANGUAGE
                ? join(DATA, dictFileName)
                : join(LANGUAGES, lang, dictFileName);
        writeJSON(dictPath, descriptionsDict);

        const prefix = getConsolePrefix(lang, dictFileName);
        console.log(`${prefix} ${Object.keys(descriptionsDict).length} items`);
    });
}