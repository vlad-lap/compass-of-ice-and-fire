import { LngLatLike } from 'maplibre-gl';

export enum MapBounds {
    North = 48.8,
    South = -39.3,
    East = 127.4,
    West = -7.1,
}

export const INITIAL_MAP_CENTER: LngLatLike = [15, 10];

export enum ZoomLevel {
    Initial = 3.4,
    Low = 3.9,
    Medium = 4.6,
    High = 5.9,
    Max = 9,
}

export const ZOOM_DURATION = 300;
export const ZOOM_STEP = 0.5;
export const LONG_PRESS_TOOLTIP_TIMEOUT_MS = 150;
export const LONG_PRESS_DURATION_MS = 800;

export const BLACK = '#333333';
export const GREY = '#7b766f';
export const LIGHT_GREY = '#b0aaa2';
export const WHITE = '#faf7ef';
export const RED = '#ff3b30';
export const ORANGE = '#ffa80d';
export const BROWN = '#6d4106';

export enum LandscapeColor {
    Land = '#d2fade',
    Water = '#97e3f8',
    Forest = '#93cba2',
    ForestNorth = '#93cbc4',
    ForestSouth = '#a1cb93',
    ForestUlthos = '#ac93cb',
    Swamp = '#d7f6a1',
    Desert = '#f4efe5',
    Snow = '#ffffff',
    Road = ORANGE,
    Wall = WHITE,
    KingdomBorder = GREY,
    Volcano = ORANGE,
    Wasteland = '#f5f4f4',
    RedLake = '#f8c1c1',
    DryLake = '#e8e4d9',
}

export const MOUNTAIN_COLORS = ['#e9e7dd', '#deddd4', '#d3d5cf'];

export enum LabelColor {
    Land = '#12875f',
    Water = '#1a6b8a',
    Mountain = BROWN,
    Desert = BROWN,
    Wasteland = GREY,
    Road = '#bd7c05',
    Wall = BLACK,
    Location = BLACK,
    Ruin = GREY,
    RedLake = '#9c2b2b',
}

export enum LocationRadius {
    SM = 1.5,
    MD = 2.5,
    LG = 4,
}

export enum HitRadiusPx {
    Mouse = 2,
    Touch = 15,
}

export const CLICKABLE_LAYER_IDS = [
    'tier1-point',
    'tier2-point',
    'tier3-point',
    'tier4-point',
    'the-wall-line',
    'the-five-forts-point',
];

export const LONG_PRESSABLE_LAYER_IDS = [
    'kingdoms-fill',
    'countries-fill',
    'regions-fill',
];

export enum FontStyle {
    Regular = 'Noto Sans Regular',
    Italic = 'Noto Sans Italic',
    Bold = 'Noto Sans Bold',
}

export enum FontSize {
    XS = 8,
    SM = 10,
    MD = 12,
    LG = 14,
    XL = 18,
}
