import {
    CircleLayerSpecification,
    DataDrivenPropertyValueSpecification,
    ExpressionSpecification,
    FillLayerSpecification,
    ImageSourceSpecification,
    LineLayerSpecification,
    LngLatBoundsLike,
    RasterLayerSpecification,
    StyleSpecification,
    SymbolLayerSpecification,
} from 'maplibre-gl';
import {
    BLACK,
    FontSize,
    FontStyle,
    LabelColor,
    LandscapeColor,
    WHITE,
    LocationRadius,
    MapBounds,
    RED,
    ZoomLevel,
    GREY,
    LIGHT_GREY,
    MOUNTAIN_COLORS,
} from './constants';
import { GeodataDict, LocationDict } from '../../models';

export const MAP_STYLE: StyleSpecification = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
        {
            id: 'background',
            type: 'background',
            paint: {
                'background-color': LandscapeColor.Water,
            },
        },
    ],
};

export const MAP_BOUNDS: LngLatBoundsLike = [
    [MapBounds.West, MapBounds.South],
    [MapBounds.East, MapBounds.North],
];

const GRADIENT_WIDTH = 2;

export const GRADIENT_COORDINATES: Record<string, ImageSourceSpecification['coordinates']> = {
    north: [
        [MapBounds.West, MapBounds.North],
        [MapBounds.East, MapBounds.North],
        [MapBounds.East, MapBounds.North - GRADIENT_WIDTH],
        [MapBounds.West, MapBounds.North - GRADIENT_WIDTH],
    ],
    south: [
        [MapBounds.West, MapBounds.South],
        [MapBounds.East, MapBounds.South],
        [MapBounds.East, MapBounds.South + GRADIENT_WIDTH],
        [MapBounds.West, MapBounds.South + GRADIENT_WIDTH],
    ],
    east: [
        [MapBounds.East, MapBounds.North],
        [MapBounds.East, MapBounds.South],
        [MapBounds.East - GRADIENT_WIDTH, MapBounds.South],
        [MapBounds.East - GRADIENT_WIDTH, MapBounds.North],
    ],
    west: [
        [MapBounds.West, MapBounds.North],
        [MapBounds.West, MapBounds.South],
        [MapBounds.West + GRADIENT_WIDTH, MapBounds.South],
        [MapBounds.West + GRADIENT_WIDTH, MapBounds.North],
    ],
};

export const GRADIENT_PAINT: RasterLayerSpecification['paint'] = {
    'raster-fade-duration': 0,
};

const RIDGES_HEIGHT_FILTER: Record<string, ExpressionSpecification[]> = {
    light: [
        ['all', ['==', ['get', 'shade'], 'light'], ['==', ['get', 'size'], 1]],
        ['all', ['==', ['get', 'shade'], 'light'], ['==', ['get', 'size'], 2]],
        ['all', ['==', ['get', 'shade'], 'light'], ['==', ['get', 'size'], 3]],
    ],
    dark: [
        ['all', ['==', ['get', 'shade'], 'dark'], ['==', ['get', 'size'], 1]],
        ['all', ['==', ['get', 'shade'], 'dark'], ['==', ['get', 'size'], 2]],
        ['all', ['==', ['get', 'shade'], 'dark'], ['==', ['get', 'size'], 3]],
    ],
};

export const POLYGONS_PAINT: GeodataDict<FillLayerSpecification['paint']> = {
    continents: {
        'fill-color': LandscapeColor.Land,
    },
    islands: {
        'fill-color': LandscapeColor.Land,
    },
    mountains: {
        'fill-opacity': 0,
    },
    mountainRidges: {
        'fill-color': [
            'case',

            RIDGES_HEIGHT_FILTER.light[0],
            MOUNTAIN_COLORS.light[0],
            RIDGES_HEIGHT_FILTER.light[1],
            MOUNTAIN_COLORS.light[1],
            RIDGES_HEIGHT_FILTER.light[2],
            MOUNTAIN_COLORS.light[2],

            RIDGES_HEIGHT_FILTER.dark[0],
            MOUNTAIN_COLORS.dark[0],
            RIDGES_HEIGHT_FILTER.dark[1],
            MOUNTAIN_COLORS.dark[1],
            RIDGES_HEIGHT_FILTER.dark[2],
            MOUNTAIN_COLORS.dark[2],

            'transparent',
        ],
        'fill-opacity': ['match', ['get', 'size'], 1, 0.4, 0.6],
    },
    forests: {
        'fill-color': LandscapeColor.Forest,
        'fill-opacity': 0.35,
    },
    snow: {
        'fill-color': LandscapeColor.Snow,
        'fill-opacity': 0.8,
    },
    deserts: {
        'fill-color': LandscapeColor.Desert,
        'fill-opacity': 0.8,
    },
    wastelands: {
        'fill-color': LandscapeColor.Wasteland,
        'fill-opacity': 0.7,
    },
    swamps: {
        'fill-color': LandscapeColor.Swamp,
        'fill-opacity': 0.5,
    },
    lakes: {
        'fill-color': [
            'match',
            ['get', 'variant'],
            'red',
            LandscapeColor.RedLake,
            LandscapeColor.Water,
        ],
    },
    seas: {
        'fill-opacity': 0,
    },
    shores: {
        'fill-opacity': 0,
    },
    lands: {
        'fill-opacity': 0,
    },
};

export const LINES_LAYOUT: GeodataDict<LineLayerSpecification['layout']> = {
    roads: {
        'line-cap': 'round',
        'line-join': 'round',
    },
    wall: {
        'line-cap': 'round',
        'line-join': 'round',
    },
};

export const LINES_PAINT: GeodataDict<LineLayerSpecification['paint']> = {
    rivers: {
        'line-color': LandscapeColor.Water,
    },
    roads: {
        'line-color': LandscapeColor.Road,
    },
    wall: {
        'line-color': LandscapeColor.Wall,
        'line-width': 3,
    },
    kingdomBorders: {
        'line-color': LandscapeColor.KingdomBorder,
        'line-dasharray': [4, 4],
        'line-opacity': 0.6,
    },
};

export const LINES_OUTLINE: GeodataDict<LineLayerSpecification['paint']> = {
    wall: {
        'line-color': BLACK,
        'line-width': 5,
    },
};

export const LINES_SHADOW: GeodataDict<LineLayerSpecification['paint']> = {
    wall: {
        'line-color': BLACK,
        'line-width': 7,
        'line-opacity': 0.3,
        'line-blur': 8,
        'line-translate': [1, 1],
    },
};

export const LOCATIONS_FILTER: LocationDict<ExpressionSpecification> = {
    primary: ['any', ['==', ['get', 'size'], 4], ['==', ['get', 'size'], 5]],
    secondary: ['==', ['get', 'size'], 3],
    tertiary: ['any', ['==', ['get', 'size'], 1], ['==', ['get', 'size'], 2]],
};

export const LABEL_SIZE_FILTER: ExpressionSpecification = ['>', ['number', ['get', 'size']], 1];

export const LOCATION_LABELS_FILTER: LocationDict<ExpressionSpecification> = {
    primary: ['all', LOCATIONS_FILTER.primary, LABEL_SIZE_FILTER],
    secondary: ['all', LOCATIONS_FILTER.secondary, LABEL_SIZE_FILTER],
    tertiary: ['all', LOCATIONS_FILTER.tertiary, LABEL_SIZE_FILTER],
};

export const LOCATIONS_MIN_ZOOM: LocationDict<ZoomLevel> = {
    secondary: ZoomLevel.Medium,
    tertiary: ZoomLevel.High,
};

const POINT_CIRCLE_RADIUS: DataDrivenPropertyValueSpecification<number> = [
    'case',
    LOCATIONS_FILTER.primary,
    LocationRadius.LG,
    LOCATIONS_FILTER.secondary,
    LocationRadius.MD,
    LOCATIONS_FILTER.tertiary,
    LocationRadius.SM,
    LocationRadius.MD,
];

const POINT_SHADOW_BLUR = 2;
const POINT_SHADOW_RADIUS: DataDrivenPropertyValueSpecification<number> = [
    'case',
    LOCATIONS_FILTER.primary,
    LocationRadius.LG + POINT_SHADOW_BLUR,
    LOCATIONS_FILTER.secondary,
    LocationRadius.MD + POINT_SHADOW_BLUR,
    LOCATIONS_FILTER.tertiary,
    LocationRadius.SM + POINT_SHADOW_BLUR,
    LocationRadius.MD + POINT_SHADOW_BLUR,
];

export const POINTS_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': POINT_CIRCLE_RADIUS,
    'circle-color': ['match', ['get', 'type'], 'Ruin', LIGHT_GREY, WHITE],
    'circle-stroke-color': ['match', ['get', 'type'], 'Ruin', GREY, BLACK],
    'circle-stroke-width': 1,
};

export const POINTS_SHADOW: CircleLayerSpecification['paint'] = {
    'circle-radius': POINT_SHADOW_RADIUS,
    'circle-color': BLACK,
    'circle-opacity': 0.3,
    'circle-blur': 0.8,
    'circle-translate': [1.5, 1.5],
};

export const VOLCANOES_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': LocationRadius.MD,
    'circle-color': LandscapeColor.Volcano,
};

export const VOLCANOES_SMOKE_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': ['match', ['get', 'smokeRadius'], 0, 7, 1, 9, 2, 11, 9],
    'circle-color': BLACK,
    'circle-opacity': 0.3,
    'circle-blur': 0.8,
    'circle-translate': [3, -3],
};

export const LABELS_MIN_ZOOM: GeodataDict<ZoomLevel> = {
    kingdoms: ZoomLevel.Initial,
    shores: ZoomLevel.Medium,
    lands: ZoomLevel.Low,
    mountains: ZoomLevel.Medium,
    forests: ZoomLevel.Medium,
    swamps: ZoomLevel.Low,
    deserts: ZoomLevel.Low,
    islands: ZoomLevel.Medium,
    lakes: ZoomLevel.Low,
    rivers: ZoomLevel.Low,
    roads: ZoomLevel.Medium,
};

export const DEFAULT_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    'text-field': ['get', 'name'],
    'text-font': [FontStyle.Italic],
    'text-size': [
        'match',
        ['get', 'size'],
        1,
        FontSize.SM,
        2,
        FontSize.SM,
        3,
        FontSize.MD,
        4,
        FontSize.MD,
        5,
        FontSize.LG,
        FontSize.MD,
    ]
};

const DEFAULT_LINE_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    ...DEFAULT_LABEL_LAYOUT,
    'text-size': FontSize.SM,
    'symbol-placement': 'line-center',
};

const DEFAULT_POINT_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    ...DEFAULT_LABEL_LAYOUT,
    'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
    'text-radial-offset': 0.6,
    'text-justify': 'auto',
    'text-font': [
        'match',
        ['get', 'type'],
        'City',
        ['literal', [FontStyle.Bold]],
        'Town',
        ['literal', [FontStyle.Bold]],
        ['literal', [FontStyle.Regular]],
    ],
    'text-size': [
        'case',
        LOCATIONS_FILTER.primary,
        FontSize.LG,
        LOCATIONS_FILTER.secondary,
        FontSize.MD,
        LOCATIONS_FILTER.tertiary,
        FontSize.SM,
        FontSize.MD,
    ],
};

export const LABEL_LAYOUT: Partial<GeodataDict<SymbolLayerSpecification['layout']>> = {
    continents: {
        ...DEFAULT_LABEL_LAYOUT,
        'text-size': FontSize.XL,
        'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
        'text-justify': 'auto',
    },
    lakes: {
        ...DEFAULT_LABEL_LAYOUT,
        'text-size': FontSize.SM,
    },
    islands: {
        ...DEFAULT_LABEL_LAYOUT,
        'text-size': FontSize.SM,
    },
    kingdoms: {
        ...DEFAULT_LABEL_LAYOUT,
        'text-size': FontSize.LG,
        'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
        'text-justify': 'auto',
    },
    rivers: DEFAULT_LINE_LABEL_LAYOUT,
    roads: {
        ...DEFAULT_LINE_LABEL_LAYOUT,
        'text-font': [FontStyle.Bold],
    },
    wall: {
        ...DEFAULT_LINE_LABEL_LAYOUT,
        'text-font': [FontStyle.Bold],
        'text-size': FontSize.LG,
    },
    locations: DEFAULT_POINT_LABEL_LAYOUT,
};

const DEFAULT_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
    'text-halo-color': WHITE,
    'text-halo-width': 1,
    'text-color': GREY,
};

const DEFAULT_LAND_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
    ...DEFAULT_LABEL_PAINT,
    'text-color': LabelColor.Land,
};

const DEFAULT_WATER_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
    ...DEFAULT_LABEL_PAINT,
    'text-color': LabelColor.Water,
};

export const LABEL_PAINT: Partial<GeodataDict<SymbolLayerSpecification['paint']>> = {
    kingdoms: DEFAULT_LABEL_PAINT,
    lands: DEFAULT_LABEL_PAINT,
    shores: DEFAULT_LABEL_PAINT,
    continents: DEFAULT_LABEL_PAINT,
    islands: DEFAULT_LAND_LABEL_PAINT,
    forests: DEFAULT_LAND_LABEL_PAINT,
    swamps: DEFAULT_LAND_LABEL_PAINT,
    lakes: {
        ...DEFAULT_LABEL_PAINT,
        'text-color': [
            'match',
            ['get', 'variant'],
            'red',
            LabelColor.RedLake,
            LabelColor.Water,
        ],
    },
    seas: DEFAULT_WATER_LABEL_PAINT,
    rivers: DEFAULT_WATER_LABEL_PAINT,
    mountains: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Mountain },
    deserts: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Desert },
    roads: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Road },
    wall: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Wall },
    locations: {
        ...DEFAULT_LABEL_PAINT,
        'text-color': [
            'match',
            ['get', 'type'],
            'Ruin',
            LabelColor.Ruin,
            LabelColor.Location,
        ],
    },
};

export const SEARCH_HIGHLIGHT_LINE_LAYOUT: LineLayerSpecification['layout'] = {
    'line-cap': 'round',
    'line-join': 'round',
}

export const SEARCH_HIGHLIGHT_POLYGON_PAINT: LineLayerSpecification['paint'] = {
    'line-width': 2,
    'line-color': RED,
    'line-opacity': 0.7,
    'line-dasharray': [1, 1],
};

export const SEARCH_HIGHLIGHT_LINE_PAINT: LineLayerSpecification['paint'] = {
    'line-width': 9,
    'line-color': RED,
    'line-opacity': 0.7,
};

export const SEARCH_HIGHLIGHT_CIRCLE_PAINT: CircleLayerSpecification['paint'] = {
    'circle-opacity': 0,
    'circle-radius': POINT_CIRCLE_RADIUS,
    'circle-stroke-color': RED,
    'circle-stroke-width': 10,
    'circle-stroke-opacity': 0.7,
};

export const DIM_OVERLAY_PAINT: FillLayerSpecification['paint'] = {
    'fill-color': BLACK,
    'fill-opacity': 0.15,
};
