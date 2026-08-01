import { LngLatLike } from 'maplibre-gl';

export enum MapBounds {
    North = 48.8,
    South = -39.3,
    East = 92,
    West = -7.1,
}

export const INITIAL_MAP_CENTER: LngLatLike = [15, 10];

export enum ZoomLevel {
    Initial = 3.4,
    Low = 3.9,
    Medium = 4.6,
    High = 5.9,
}

export const ZOOM_DURATION = 300;
export const ZOOM_STEP = 0.5;

export const BLACK = '#333333';
export const GREY = '#7b766f';
export const LIGHT_GREY = '#b0aaa2';
export const WHITE = '#faf7ef';
export const RED = '#ff3b30';
export const ORANGE = '#ffa80d';

export enum LandscapeColor {
    Land = '#d2fade',
    Water = '#97e3f8',
    Forest = '#93cba2',
    Swamp = '#cdf38a',
    Desert = '#f4efe5',
    Snow = '#ffffff',
    Road = ORANGE,
    Wall = WHITE,
    KingdomBorder = GREY,
    Volcano = ORANGE,
    Wasteland = '#dedede',
    RedLake = '#f8c1c1',
}

export const MOUNTAIN_COLORS = {
    light: ['#eeeff1', '#eceef0', '#e8eaec'],
    dark: ['#e6e8ea', '#dee1e4', '#d4d7da'],
};

export enum LabelColor {
    Land = '#12875f',
    Water = '#1a6b8a',
    Mountain = GREY,
    Desert = '#5a4208',
    Road = '#bd7c05',
    Wall = BLACK,
    Location = BLACK,
    Ruin = GREY,
    RedLake = '#9c2b2b',
}

export enum LocationRadius {
    SM = 2,
    MD = 3,
    LG = 4,
}

export const TOUCH_HIT_RADIUS_PX = 15;

export const SELECTABLE_LAYER_IDS = [
    'primary-point',
    'secondary-point',
    'tertiary-point',
    'wall-line',
];

export enum FontStyle {
    Regular = 'Noto Sans Regular',
    Italic = 'Noto Sans Italic',
    Bold = 'Noto Sans Bold',
}

export enum FontSize {
    SM = 10,
    MD = 12,
    LG = 14,
    XL = 18,
}
