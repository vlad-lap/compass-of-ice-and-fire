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

const GRADIENT_WIDTH = 0.5;

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
            'match',
            ['get', 'height'],
            1,
            MOUNTAIN_COLORS[0],
            2,
            MOUNTAIN_COLORS[1],
            3,
            MOUNTAIN_COLORS[2],
            'transparent',
        ],
        'fill-opacity': ['match', ['get', 'shade'], 'light', 0, 0.4],
    },
    forests: {
        'fill-color': [
            'case',
            ['==', ['get', 'continentId'], 'ulthos'],
            LandscapeColor.ForestUlthos,
            ['all', ['==', ['get', 'continentId'], 'westeros'], ['>=', ['get', 'centerLat'], 17]],
            LandscapeColor.ForestNorth,
            ['all', ['!=', ['get', 'continentId'], 'westeros'], ['>=', ['get', 'centerLat'], 7]],
            LandscapeColor.ForestNorth,
            ['<=', ['get', 'centerLat'], -17],
            LandscapeColor.ForestSouth,
            LandscapeColor.Forest,
        ],
        'fill-opacity': 0.35,
    },
    snow: {
        'fill-color': LandscapeColor.Snow,
        'fill-opacity': 0.7,
    },
    steppes: {
        'fill-opacity': 0,
    },
    deserts: {
        'fill-color': LandscapeColor.Desert,
        'fill-opacity': 0.7,
    },
    wastelands: {
        'fill-color': LandscapeColor.Wasteland,
        'fill-opacity': 0.7,
    },
    swamps: {
        'fill-color': LandscapeColor.Swamp,
        'fill-opacity': ['step', ['zoom'], 0, ZoomLevel.Low, 0.3],
    },
    lakes: {
        'fill-color': [
            'step',
            ['zoom'],
            ['match', ['get', 'variant'], 'dry', LandscapeColor.DryLake, LandscapeColor.Water],
            ZoomLevel.Low,
            [
                'match',
                ['get', 'variant'],
                'red',
                LandscapeColor.RedLake,
                'dry',
                LandscapeColor.DryLake,
                LandscapeColor.Water,
            ],
        ],
    },
    seas: {
        'fill-opacity': 0,
    },
    shores: {
        'fill-opacity': 0,
    },
    vales: {
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
    theWall: {
        'line-cap': 'round',
        'line-join': 'round',
    },
};

export const LINES_PAINT: GeodataDict<LineLayerSpecification['paint']> = {
    rivers: {
        'line-color': LandscapeColor.Water,
        'line-width': ['match', ['get', 'size'], 1, 0.6, 2, 1.2, 3, 1.8, 1.2],
        'line-opacity': ['step', ['zoom'], ['match', ['get', 'size'], 1, 0, 1], ZoomLevel.Low, 1],
    },
    roads: {
        'line-color': LandscapeColor.Road,
        'line-width': ['match', ['get', 'size'], 1, 0.4, 2, 0.8, 3, 1.2, 0.8],
        'line-opacity': ['step', ['zoom'], 0, ZoomLevel.Low, 1],
    },
    theWall: {
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
    theWall: {
        'line-color': BLACK,
        'line-width': 5,
    },
};

export const LINES_SHADOW: GeodataDict<LineLayerSpecification['paint']> = {
    theWall: {
        'line-color': BLACK,
        'line-width': 7,
        'line-opacity': 0.3,
        'line-blur': 8,
        'line-translate': [1, 1],
    },
};

export const LOCATIONS_FILTER: LocationDict<ExpressionSpecification> = {
    tier1: ['==', ['get', 'size'], 5],
    tier2: ['==', ['get', 'size'], 4],
    tier3: ['==', ['get', 'size'], 3],
    tier4: ['any', ['==', ['get', 'size'], 2], ['==', ['get', 'size'], 1]],
};

export const LABEL_SIZE_FILTER: ExpressionSpecification = ['>', ['number', ['get', 'size']], 1];

export const LOCATION_LABELS_FILTER: LocationDict<ExpressionSpecification> = {
    tier1: ['all', LOCATIONS_FILTER.tier1, LABEL_SIZE_FILTER],
    tier2: ['all', LOCATIONS_FILTER.tier2, LABEL_SIZE_FILTER],
    tier3: ['all', LOCATIONS_FILTER.tier3, LABEL_SIZE_FILTER],
    tier4: ['all', LOCATIONS_FILTER.tier4, LABEL_SIZE_FILTER],
};

export const LOCATIONS_MIN_ZOOM: LocationDict<ZoomLevel> = {
    tier2: ZoomLevel.Low,
    tier3: ZoomLevel.Medium,
    tier4: ZoomLevel.High,
};

const POINT_CIRCLE_RADIUS: DataDrivenPropertyValueSpecification<number> = [
    'case',
    LOCATIONS_FILTER.tier1,
    LocationRadius.LG,
    LOCATIONS_FILTER.tier2,
    LocationRadius.MD,
    LOCATIONS_FILTER.tier3,
    LocationRadius.MD,
    LOCATIONS_FILTER.tier4,
    LocationRadius.SM,
    LocationRadius.MD,
];

const POINT_SHADOW_BLUR = 2;
const POINT_SHADOW_RADIUS: DataDrivenPropertyValueSpecification<number> = [
    'case',
    LOCATIONS_FILTER.tier1,
    LocationRadius.LG + POINT_SHADOW_BLUR,
    LOCATIONS_FILTER.tier2,
    LocationRadius.MD + POINT_SHADOW_BLUR,
    LOCATIONS_FILTER.tier3,
    LocationRadius.MD + POINT_SHADOW_BLUR,
    LOCATIONS_FILTER.tier4,
    LocationRadius.SM + POINT_SHADOW_BLUR,
    LocationRadius.MD + POINT_SHADOW_BLUR,
];

export const POINTS_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': POINT_CIRCLE_RADIUS,
    'circle-color': ['match', ['get', 'type'], 'ruin', LIGHT_GREY, WHITE],
    'circle-stroke-color': ['match', ['get', 'type'], 'ruin', GREY, BLACK],
    'circle-stroke-width': 1,
};

export const POINTS_SHADOW: CircleLayerSpecification['paint'] = {
    'circle-radius': POINT_SHADOW_RADIUS,
    'circle-color': BLACK,
    'circle-opacity': 0.3,
    'circle-blur': 0.8,
    'circle-translate': [1.5, 1.5],
};

export const FIVE_FORTS_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': [
        'step',
        ['zoom'],
        LocationRadius.SM,
        ZoomLevel.Low,
        LocationRadius.MD,
    ],
    'circle-color': WHITE,
    'circle-stroke-color': BLACK,
    'circle-stroke-width': 1,
};

export const FIVE_FORTS_SHADOW: CircleLayerSpecification['paint'] = {
    'circle-radius': [
        'step',
        ['zoom'],
        LocationRadius.SM + POINT_SHADOW_BLUR,
        ZoomLevel.Low,
        LocationRadius.MD + POINT_SHADOW_BLUR
    ],
    'circle-color': BLACK,
    'circle-opacity': 0.3,
    'circle-blur': 0.8,
    'circle-translate': [1.5, 1.5],
};

export const VOLCANOES_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': LocationRadius.MD,
    'circle-color': LandscapeColor.Volcano,
    'circle-opacity': 0.5,
};

export const VOLCANOES_SMOKE_PAINT: CircleLayerSpecification['paint'] = {
    'circle-radius': ['match', ['get', 'smokeRadius'], 0, 7, 1, 9, 2, 11, 9],
    'circle-color': BLACK,
    'circle-opacity': 0.2,
    'circle-blur': 0.8,
    'circle-translate': [3, -3],
};

export const LABELS_MIN_ZOOM: GeodataDict<ZoomLevel> = {
    kingdoms: ZoomLevel.Initial,
    kingdomBorders: ZoomLevel.High,
    shores: ZoomLevel.Medium,
    vales: ZoomLevel.Medium,
    lands: ZoomLevel.Low,
    mountains: ZoomLevel.Low,
    forests: ZoomLevel.Low,
    swamps: ZoomLevel.Low,
    deserts: ZoomLevel.Low,
    islands: ZoomLevel.Low,
    lakes: ZoomLevel.Low,
    rivers: ZoomLevel.Low,
    roads: ZoomLevel.Medium,
};

export const LABELS_MAX_ZOOM: GeodataDict<ZoomLevel> = {
    continents: ZoomLevel.Low,
    kingdoms: ZoomLevel.Medium,
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
        FontSize.LG,
        5,
        FontSize.LG,
        FontSize.MD,
    ]
};

const DEFAULT_LABEL_POINT_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    ...DEFAULT_LABEL_LAYOUT,
    'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
    'text-justify': 'auto',
};

const DEFAULT_LINE_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    ...DEFAULT_LABEL_LAYOUT,
    'text-size': FontSize.SM,
    'symbol-placement': 'line-center',
};

const DEFAULT_POINT_LABEL_LAYOUT: SymbolLayerSpecification['layout'] = {
    ...DEFAULT_LABEL_POINT_LABEL_LAYOUT,
    'text-radial-offset': 0.6,
    'text-font': [
        'match',
        ['get', 'type'],
        'city',
        ['literal', [FontStyle.Bold]],
        ['literal', [FontStyle.Regular]],
    ],
    'text-size': [
        'case',
        LOCATIONS_FILTER.tier1,
        FontSize.LG,
        LOCATIONS_FILTER.tier2,
        FontSize.MD,
        LOCATIONS_FILTER.tier3,
        FontSize.MD,
        LOCATIONS_FILTER.tier4,
        FontSize.SM,
        FontSize.MD,
    ],
};

export const LABEL_LAYOUT: Partial<GeodataDict<SymbolLayerSpecification['layout']>> = {
    continents: {
        ...DEFAULT_LABEL_POINT_LABEL_LAYOUT,
        'text-size': FontSize.XL,
    },
    lakes: {
        ...DEFAULT_LABEL_LAYOUT,
        'text-size': FontSize.SM,
    },
    islands: {
        ...DEFAULT_LABEL_POINT_LABEL_LAYOUT,
        'text-size': FontSize.MD,
    },
    kingdoms: {
        ...DEFAULT_LABEL_POINT_LABEL_LAYOUT,
        'text-size': FontSize.LG,
    },
    kingdomBorders: DEFAULT_LINE_LABEL_LAYOUT,
    lands: DEFAULT_LABEL_POINT_LABEL_LAYOUT,
    rivers: DEFAULT_LINE_LABEL_LAYOUT,
    roads: {
        ...DEFAULT_LINE_LABEL_LAYOUT,
        'text-font': [FontStyle.Bold],
    },
    theWall: {
        ...DEFAULT_LINE_LABEL_LAYOUT,
        'text-font': [FontStyle.Bold],
        'text-size': FontSize.LG,
    },
    locations: DEFAULT_POINT_LABEL_LAYOUT,
    theFiveForts: {
        ...DEFAULT_LABEL_POINT_LABEL_LAYOUT,
        'text-variable-anchor': ['top-right', 'bottom-left'],
        'text-radial-offset': 0.6,
        'text-font': [FontStyle.Bold],
        'text-size': FontSize.LG,
    },
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
    kingdomBorders: DEFAULT_LABEL_PAINT,
    lands: DEFAULT_LABEL_PAINT,
    shores: DEFAULT_LAND_LABEL_PAINT,
    vales: DEFAULT_LAND_LABEL_PAINT,
    continents: DEFAULT_LABEL_PAINT,
    islands: DEFAULT_LAND_LABEL_PAINT,
    forests: DEFAULT_LAND_LABEL_PAINT,
    steppes: DEFAULT_LAND_LABEL_PAINT,
    swamps: DEFAULT_LAND_LABEL_PAINT,
    lakes: {
        ...DEFAULT_LABEL_PAINT,
        'text-color': [
            'match',
            ['get', 'variant'],
            'red',
            LabelColor.RedLake,
            'dry',
            LabelColor.Desert,
            LabelColor.Water,
        ],
    },
    seas: DEFAULT_WATER_LABEL_PAINT,
    rivers: DEFAULT_WATER_LABEL_PAINT,
    mountains: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Mountain },
    wastelands: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Wasteland },
    deserts: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Desert },
    roads: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Road },
    theWall: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Wall },
    locations: {
        ...DEFAULT_LABEL_PAINT,
        'text-color': ['match', ['get', 'type'], 'ruin', LabelColor.Ruin, LabelColor.Location],
    },
    theFiveForts: { ...DEFAULT_LABEL_PAINT, 'text-color': LabelColor.Location },
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
    'fill-opacity': 0.05,
};
