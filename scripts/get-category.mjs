import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readJSON } from './json-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

export function getCategory(feature) {
    const categories = readJSON(join(DATA, 'categories.json'));
    return categories.find(({ locations }) => locations.includes(feature.properties.id));
}