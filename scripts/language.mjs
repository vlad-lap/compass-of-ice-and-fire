import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from './constants.mjs';
import { readJSON, writeJSON } from './json-utils.mjs';
import { mapGeodata } from './geodata-utils.mjs';
import { getConsolePrefix, getConsoleStats } from './console-utils.mjs';
import _ from 'lodash';
import { getCategory } from './get-category.mjs';

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
            const nameVariantsDict = readJSON(join(LANGUAGES, lang, 'name-variants.json'));
            const claimedByDict = readJSON(join(LANGUAGES, lang, 'claimed-by.json'));
            const categoriesDict = readJSON(join(LANGUAGES, lang, 'categories.json'));

            const category = getCategory(feature);

            return {
                ...props,
                [`name_${lang}`]: namesDict[feature.properties.id] ?? null,
                [`description_${lang}`]: descriptionsDict[feature.properties.id] ?? null,
                [`nameVariant_${lang}`]: nameVariantsDict[feature.properties.id] ?? null,
                [`category_${lang}`]: categoriesDict[category?.id] ?? null,
                ...(feature.properties.type
                    ? { [`type_${lang}`]: typesDict[feature.properties.type] ?? null }
                    : {}
                ),
                ...(feature.properties.ClaimedBy
                    ? { [`ClaimedBy_${lang}`]: claimedByDict[feature.properties.id] ?? null }
                    : {}
                ),
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

export function syncDictionary(dataItems, key, keepNulls = true) {
    AVAILABLE_LANGUAGES.forEach(lang => {
        const descriptionKey = lang === DEFAULT_LANGUAGE ? key : `${key}_${lang}`;
        const dict = dataItems
            .filter(({ name }) => !!name)
            .reduce(
                (dict, dataItem) => ({
                    ...dict,
                    [dataItem.id]: dataItem[descriptionKey],
                }),
                {},
            );
        const dictFileNames = {
            description: 'descriptions.json',
            nameVariant: 'name-variants.json',
        };
        const dictFileName = dictFileNames[key];
        const dictPath =
            lang === DEFAULT_LANGUAGE
                ? join(DATA, dictFileName)
                : join(LANGUAGES, lang, dictFileName);

        const syncedDict = keepNulls ? dict : _.omitBy(dict, _.isNil);
        writeJSON(dictPath, syncedDict);

        const prefix = getConsolePrefix(lang, dictFileName);
        const all = Object.entries(syncedDict);
        const filled = all.filter(([_, description]) => !!description);
        console.log(`${prefix} ${getConsoleStats(filled.length, all.length)}`);
    });
}