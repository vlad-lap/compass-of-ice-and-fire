import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    signal,
    viewChild,
    ViewContainerRef,
} from '@angular/core';
import { Store } from '@ngxs/store';
import {
    GeoJSONSourceComponent,
    ImageSourceComponent,
    LayerComponent,
    MapComponent,
    MarkerComponent,
} from '@maplibre/ngx-maplibre-gl';
import {
    CircleLayerSpecification,
    LineLayerSpecification,
    LngLatBounds,
    LngLatLike,
    Map,
    MapGeoJSONFeature,
    MapLayerMouseEvent,
    MapMouseEvent,
    MapTouchEvent,
    SymbolLayerSpecification,
} from 'maplibre-gl';
import { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';
import {
    CLICKABLE_LAYER_IDS,
    GREEN,
    HitRadiusPx,
    INITIAL_MAP_CENTER,
    KM_PER_COORD_UNIT,
    LONG_PRESS_DURATION_MS,
    RED,
    ROUTE_LAYER_IDS,
    SCALE_BAR_MAX_WIDTH_PX,
    ZOOM_DURATION,
    ZOOM_STEP,
    ZoomLevel,
} from './constants';
import {
    FeatureData,
    GeodataDict,
    GeodataType,
    LineGeodataType,
    LocationTier,
    PolygonGeodataType,
    RouteEndpoints,
    RoutePlan,
    RoutePointValue,
    TravelMode,
} from '../../models';
import {
    GEODATA_STATE_TOKEN,
    GeodataState,
    LanguagesState,
    SetPosition,
    UserSettingsState,
} from '../../store';
import {
    DEFAULT_LABEL_LAYOUT,
    DIM_OVERLAY_PAINT,
    FIVE_FORTS_PAINT,
    FIVE_FORTS_SHADOW,
    GRADIENT_COORDINATES,
    GRADIENT_PAINT,
    LABEL_LAYOUT,
    LABEL_PAINT,
    LABELS_MAX_ZOOM,
    LABELS_MIN_ZOOM,
    LINES_LAYOUT,
    LINES_OUTLINE,
    LINES_PAINT,
    LINES_SHADOW,
    LOCATION_LABEL_ANCHOR_OVERRIDE_LAYOUT,
    LOCATION_LABELS_FILTER,
    LOCATIONS_FILTER,
    LOCATIONS_MIN_ZOOM,
    MAP_BOUNDS,
    MAP_STYLE,
    POINTS_PAINT,
    POINTS_SHADOW,
    POLYGONS_PAINT,
    ROUTE_ENDPOINT_PAINT,
    ROUTE_ENDPOINT_SHADOW,
    ROUTE_LINE_LAYOUT,
    ROUTE_LINE_PAINT,
    ROUTE_OUTLINE_PAINT,
    SEARCH_HIGHLIGHT_CIRCLE_PAINT,
    SEARCH_HIGHLIGHT_LINE_LAYOUT,
    SEARCH_HIGHLIGHT_LINE_PAINT,
    SEARCH_HIGHLIGHT_POLYGON_PAINT,
    VOLCANOES_PAINT,
    VOLCANOES_SMOKE_PAINT,
    LOCATION_LABELS_ANCHORS_OVERRIDE_FILTER,
} from './configs';
import {
    buildMaskPolygon,
    getGeometryPositions,
    getRoundDistanceKm,
    HighlightableGeometry,
} from '../../utils';
import { MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AboutDialogComponent } from '../about-dialog/about-dialog.component';
import { MapSearchComponent } from '../map-search/map-search.component';
import { MapScaleComponent } from '../map-scale/map-scale.component';
import { KeyValuePipe } from '@angular/common';
import { kebabCase, mapValues } from 'lodash';
import { MapService, RouteService, SearchService } from '../../services';
import { RouteControlComponent } from '../route-control/route-control.component';

@Component({
    selector: 'coiaf-map-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MapComponent,
        GeoJSONSourceComponent,
        ImageSourceComponent,
        LayerComponent,
        MarkerComponent,
        MatMiniFabButton,
        MatIcon,
        MatIconButton,
        MapSearchComponent,
        MapScaleComponent,
        KeyValuePipe,
        RouteControlComponent,
    ],
    templateUrl: './map-page.component.html',
    styleUrl: './map-page.component.scss',
})
export class MapPageComponent {
    protected readonly map = viewChild.required(MapComponent);
    protected readonly searchComponent = viewChild(MapSearchComponent);

    protected readonly language = this.store.selectSignal(UserSettingsState.language);
    protected readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly geodata: GeodataDict<FeatureCollection> =
        this.store.selectSnapshot(GEODATA_STATE_TOKEN);

    protected readonly cursorStyle = signal<string>('default');

    protected readonly scaleBarWidthPx = signal<number>(0);
    protected readonly scaleBarDistanceKm = signal<number>(0);

    protected readonly searchHighlightFeature = signal<Feature>(null);

    protected readonly routePlan = this.routeService.plan;
    protected readonly routeMode = this.routeService.selectedMode;

    protected readonly mapStyle = MAP_STYLE;
    protected readonly ZoomLevel = ZoomLevel;
    protected readonly maxBounds = MAP_BOUNDS;
    protected readonly initialCenter = INITIAL_MAP_CENTER;

    protected readonly polygonTypes: PolygonGeodataType[] = [
        'continents',
        'kingdoms',
        'countries',
        'regions',
        'seas',
        'bays',
        'straits',
        'islands',
        'shores',
        'vales',
        'snow',
        'steppes',
        'wastelands',
        'deserts',
        'swamps',
        'mountains',
        'forests',
        'lakes',
    ];
    protected readonly lineTypes: LineGeodataType[] = ['kingdomBorders', 'rivers', 'roads'];

    protected readonly labeledTypes: GeodataType[] = [
        'continents',
        'kingdoms',
        'countries',
        'regions',
        'mountains',
        'snow',
        'steppes',
        'wastelands',
        'deserts',
        'swamps',
        'seas',
        'bays',
        'straits',
        'islands',
        'shores',
        'vales',
        'forests',
        'lakes',
        'kingdomBorders',
        'rivers',
        'roads',
        'theWall',
        'theFiveForts',
    ];

    protected readonly labelPoints: GeodataDict<FeatureCollection<Point>> = {
        continents: this.store.selectSnapshot(GeodataState.labelPoints('continents')),
        kingdoms: this.store.selectSnapshot(GeodataState.labelPoints('kingdoms')),
        islands: this.store.selectSnapshot(GeodataState.labelPoints('islands')),
        countries: this.store.selectSnapshot(GeodataState.labelPoints('countries')),
        regions: this.store.selectSnapshot(GeodataState.labelPoints('regions')),
        mountains: this.store.selectSnapshot(GeodataState.labelPoints('mountains')),
        steppes: this.store.selectSnapshot(GeodataState.labelPoints('steppes')),
        deserts: this.store.selectSnapshot(GeodataState.labelPoints('deserts')),
        wastelands: this.store.selectSnapshot(GeodataState.labelPoints('wastelands')),
        theFiveForts: this.store.selectSnapshot(GeodataState.labelPoints('theFiveForts')),
    };

    protected readonly polygonsPaint = POLYGONS_PAINT;

    protected readonly linesLayout = LINES_LAYOUT;
    protected readonly linesPaint = LINES_PAINT;
    protected readonly linesOutline = LINES_OUTLINE;
    protected readonly linesShadow = LINES_SHADOW;

    protected readonly pointsPaint = POINTS_PAINT;
    protected readonly pointsShadow = POINTS_SHADOW;

    protected readonly theFiveFortsPaint = FIVE_FORTS_PAINT;
    protected readonly theFiveFortsShadow = FIVE_FORTS_SHADOW;

    protected readonly volcanoesPaint = VOLCANOES_PAINT;
    protected readonly volcanoesSmokePaint = VOLCANOES_SMOKE_PAINT;

    protected readonly locationTiers: LocationTier[] = ['tier1', 'tier2', 'tier3', 'tier4'];
    protected readonly locationsFilter = LOCATIONS_FILTER;
    protected readonly locationsMinZoom = LOCATIONS_MIN_ZOOM;

    protected readonly labelLayout = computed<GeodataDict<SymbolLayerSpecification['layout']>>(() =>
        mapValues(LABEL_LAYOUT, layout => this.getLocalizedLabelLayout(layout)),
    );
    protected readonly defaultLabelLayout = computed<SymbolLayerSpecification['layout']>(() =>
        this.getLocalizedLabelLayout(DEFAULT_LABEL_LAYOUT),
    );
    protected readonly labelPaint = LABEL_PAINT;
    protected readonly labelsMinZoom = LABELS_MIN_ZOOM;
    protected readonly labelsMaxZoom = LABELS_MAX_ZOOM;
    protected readonly locationLabelsFilter = LOCATION_LABELS_FILTER;
    protected readonly locationLabelsAnchorOverrideFilter = LOCATION_LABELS_ANCHORS_OVERRIDE_FILTER;
    protected readonly locationLabelAnchorOverrideLayout = computed<
        SymbolLayerSpecification['layout']
    >(() => this.getLocalizedLabelLayout(LOCATION_LABEL_ANCHOR_OVERRIDE_LAYOUT));

    protected readonly gradientUrl = this.buildGradientUrl();
    protected readonly gradientCoordinates = GRADIENT_COORDINATES;
    protected readonly gradientPaint = GRADIENT_PAINT;

    protected readonly searchHighlight = computed<FeatureCollection>(() => {
        const feature = this.searchHighlightFeature();
        return {
            type: 'FeatureCollection',
            features: feature ? [feature] : null,
        };
    });

    protected readonly searchHighlightLayerType = computed<'polygon' | 'line' | 'point' | null>(
        () => {
            const feature = this.searchHighlightFeature();
            return feature
                ? this.getHighlightLayerType(feature.geometry.type as HighlightableGeometry['type'])
                : null;
        },
    );

    protected readonly dimOverlay = computed<FeatureCollection>(() => {
        const feature = this.searchHighlightFeature();
        const isMaskable = this.searchHighlightLayerType() === 'polygon';
        return {
            type: 'FeatureCollection',
            features: isMaskable
                ? [
                      {
                          ...feature,
                          geometry: buildMaskPolygon(
                              feature.geometry as Polygon | MultiPolygon,
                              MAP_BOUNDS as [Position, Position],
                          ),
                      },
                  ]
                : null,
        };
    });

    protected readonly routeEnabled = this.routeService.routeEnabled;

    protected readonly routeEndpointMarkers = computed<{
        from: LngLatLike | null;
        to: LngLatLike | null;
    }>(() => {
        const { from, to } = this.routeService.endpointPositions();
        return {
            from: from ? [from[0], from[1]] : null,
            to: to ? [to[0], to[1]] : null,
        };
    });

    protected readonly routeLine = computed<FeatureCollection>(() => {
        const mode = this.routeMode();
        const path = this.routePlan()?.[mode]?.path ?? null;

        return {
            type: 'FeatureCollection',
            features: path
                ? [
                      {
                          type: 'Feature',
                          properties: {},
                          geometry: { type: 'LineString', coordinates: path },
                      },
                  ]
                : [],
        };
    });

    protected readonly routeEndpoints = computed<FeatureCollection<Point>>(() => {
        const { from, to } = this.routeService.endpointPositions();
        const features: Feature<Point>[] = [
            from && {
                type: 'Feature' as const,
                properties: { role: 'from' },
                geometry: { type: 'Point' as const, coordinates: from },
            },
            to && {
                type: 'Feature' as const,
                properties: { role: 'to' },
                geometry: { type: 'Point' as const, coordinates: to },
            },
        ].filter(Boolean);
        return { type: 'FeatureCollection', features };
    });

    protected readonly routeEndpointPaint = ROUTE_ENDPOINT_PAINT;
    protected readonly routeEndpointShadow = ROUTE_ENDPOINT_SHADOW;

    protected readonly routeLineLayout = ROUTE_LINE_LAYOUT;
    protected readonly routeLinePaint = ROUTE_LINE_PAINT;
    protected readonly routeOutlinePaint = ROUTE_OUTLINE_PAINT;

    protected readonly markerColor = { from: RED, to: GREEN };

    protected readonly searchHighlightPolygonLayout = computed<LineLayerSpecification['layout']>(
        () => ({
            visibility: this.searchHighlightLayerType() === 'polygon' ? 'visible' : 'none',
        }),
    );

    protected readonly searchHighlightLineLayout = computed<LineLayerSpecification['layout']>(
        () => ({
            ...SEARCH_HIGHLIGHT_LINE_LAYOUT,
            visibility: this.searchHighlightLayerType() === 'line' ? 'visible' : 'none',
        }),
    );

    protected readonly searchHighPointLayout = computed<CircleLayerSpecification['layout']>(() => ({
        visibility: this.searchHighlightLayerType() === 'point' ? 'visible' : 'none',
    }));

    protected readonly searchHighlightPolygonPaint = SEARCH_HIGHLIGHT_POLYGON_PAINT;
    protected readonly searchHighlightLinePaint = SEARCH_HIGHLIGHT_LINE_PAINT;
    protected readonly searchHighlightPointPaint = SEARCH_HIGHLIGHT_CIRCLE_PAINT;

    protected readonly dimOverlayPaint = DIM_OVERLAY_PAINT;

    protected readonly kebabCase = kebabCase;

    private readonly hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    private readonly hitRadius = this.hasHover ? HitRadiusPx.Mouse : HitRadiusPx.Touch;

    private longPressTimer: ReturnType<typeof setTimeout>;
    private longPressHandled = false;

    constructor(
        private store: Store,
        private dialog: MatDialog,
        private mapService: MapService,
        private viewContainerRef: ViewContainerRef,
        private searchService: SearchService,
        private routeService: RouteService,
    ) {
        effect(() => {
            const highlight = this.searchHighlightFeature();
            if (highlight && this.hasCard(highlight)) {
                this.mapService.openFeatureCard(highlight);
            } else {
                this.mapService.closeCard();
            }
        });

        effect(() => {
            const routePlan = this.routePlan();
            const mode = this.routeMode();
            if (routePlan) {
                this.zoomToRoute(routePlan, mode);
            }
        });

        effect(() => {
            const routeEnabled = this.routeService.routeEnabled();
            if (routeEnabled) {
                this.searchHighlightFeature.set(null);
            } else {
                this.mapService.closeCard();
            }
        });
    }

    onMapLoad(map: Map): void {
        this.mapService.viewContainerRef = this.viewContainerRef;

        map.touchZoomRotate.disableRotation();

        const feature = this.searchHighlightFeature();
        if (feature) {
            this.zoomToFeature(feature);
        } else {
            const position = this.store.selectSnapshot(UserSettingsState.position);
            if (position) {
                map.jumpTo(position);
            }
        }

        this.updateScaleBar();
    }

    updateScaleBar(): void {
        const map = this.map().mapInstance;
        const y = map.getContainer().clientHeight / 2;
        const left = map.unproject([0, y]);
        const right = map.unproject([SCALE_BAR_MAX_WIDTH_PX, y]);
        const maxKm = Math.hypot(right.lng - left.lng, right.lat - left.lat) * KM_PER_COORD_UNIT;
        const roundKm = getRoundDistanceKm(maxKm);

        this.scaleBarWidthPx.set(SCALE_BAR_MAX_WIDTH_PX * (roundKm / maxKm));
        this.scaleBarDistanceKm.set(roundKm);
    }

    saveCurrentPosition(): void {
        const map = this.map().mapInstance;
        const zoom = map.getZoom();
        const center = map.getCenter();
        this.store.dispatch(new SetPosition({ zoom, center }));
    }

    zoomIn(): void {
        const map = this.map().mapInstance;
        map.easeTo({
            zoom: map.getZoom() + ZOOM_STEP,
            duration: ZOOM_DURATION,
        });
    }

    zoomOut(): void {
        const map = this.map().mapInstance;
        map.easeTo({
            zoom: map.getZoom() - ZOOM_STEP,
            duration: ZOOM_DURATION,
        });
    }

    resetMapView(): void {
        this.map().mapInstance.flyTo({ center: INITIAL_MAP_CENTER, zoom: ZoomLevel.Initial });
    }

    onFeatureEnter(event: MapLayerMouseEvent): void {
        if (!this.hasHover) {
            return;
        }

        const feature = event.features?.[0];
        const zoom = event.target.getZoom();

        if (!feature || this.isBelowLocationMinZoom(feature, zoom)) {
            return;
        }

        if (this.hasCard(feature)) {
            this.cursorStyle.set('pointer');
        }
        this.mapService.showTooltip(event, feature);
    }

    onFeatureLeave(): void {
        this.cursorStyle.set('default');
        this.mapService.hideTooltip();
    }

    onMapDragStart(): void {
        this.cancelLongPress();
        this.cursorStyle.set('grabbing');
    }

    onMapDragEnd(): void {
        this.cursorStyle.set('default');
        this.saveCurrentPosition();
    }

    onMapClick(event: MapMouseEvent): void {
        if (this.longPressHandled) {
            return;
        }

        if (this.routeEnabled()) {
            this.setRouteEndpoint(event);
            return;
        }

        const feature = this.queryRenderedFeature(event, CLICKABLE_LAYER_IDS);

        if (!feature?.properties?.name) {
            this.mapService.hideTooltip();
            return;
        }

        const isPolygonFeature =
            feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';

        const isSearchOpen = this.searchComponent()?.autocomplete().isOpen;

        if (isPolygonFeature && !isSearchOpen) {
            this.mapService.showTooltip(event, feature, {
                showCloseButton: true,
                showDetailsLink: true,
            });
        } else if (!isPolygonFeature) {
            this.searchService.selectedId.set(feature.properties.id);
        }
    }

    onMapDoubleClick({ lngLat }: MapMouseEvent): void {
        const map = this.map().mapInstance;
        map.flyTo({
            center: lngLat,
            zoom: map.getZoom() + ZOOM_STEP,
            duration: ZOOM_DURATION,
        });
    }

    onLongPressStart(event: MapMouseEvent | MapTouchEvent): void {
        this.cancelLongPress();
        this.longPressHandled = false;

        this.longPressTimer = setTimeout(() => {
            this.mapService.hideTooltip();

            if (!this.routeService.routeEnabled()) {
                this.routeService.routeEnabled.set(true);
            }

            this.setRouteEndpoint(event);
            this.longPressHandled = true;
        }, LONG_PRESS_DURATION_MS);
    }

    onLongPressEnd(): void {
        this.cancelLongPress();
    }

    search({ id }: FeatureData): void {
        const feature = this.store.selectSnapshot(GeodataState.byId(id));
        if (!feature) {
            return;
        }

        this.searchHighlightFeature.set(feature);
        this.zoomToFeature(feature);
    }

    resetSearch(): void {
        this.searchHighlightFeature.set(null);
    }

    openAboutDialog(): void {
        this.dialog.open(AboutDialogComponent);
    }

    toggleRoute(): void {
        const routeEnabled = this.routeService.routeEnabled();
        this.routeService.routeEnabled.set(!routeEnabled);
    }

    private cancelLongPress(): void {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private setRouteEndpoint(event: MapMouseEvent | MapTouchEvent): void {
        const feature = this.queryRenderedFeature(event, ROUTE_LAYER_IDS);

        const routePoint = feature
            ? (feature.properties as RoutePointValue)
            : [event.lngLat.lng, event.lngLat.lat];

        const newEndpoints = this.getUpdatedEndpoints(routePoint);
        this.routeService.endpoints.set(newEndpoints);
    }

    private getUpdatedEndpoints(point: RoutePointValue): RouteEndpoints {
        const endpoints = this.routeService.endpoints();
        const positions = this.routeService.endpointPositions();

        return !!positions.from === !!positions.to
            ? { from: point, to: null }
            : { ...endpoints, to: point };
    }

    private queryRenderedFeature(
        { target, point: { x, y } }: MapMouseEvent | MapTouchEvent,
        layers: string[],
    ): Feature {
        const zoom = target.getZoom();
        const features = target.queryRenderedFeatures(
            [
                [x - this.hitRadius, y - this.hitRadius],
                [x + this.hitRadius, y + this.hitRadius],
            ],
            { layers },
        );
        const feature = features.find(
            geoJsonFeature => !this.isBelowLocationMinZoom(geoJsonFeature, zoom),
        );

        return feature
            ? {
                  type: 'Feature',
                  properties: feature.properties,
                  geometry: feature.geometry,
              }
            : null;
    }

    private isBelowLocationMinZoom({ layer }: MapGeoJSONFeature, zoom: number): boolean {
        const tier = this.locationTiers.find(locationTier => layer.id === `${locationTier}-point`);
        return !!tier && zoom < (LOCATIONS_MIN_ZOOM[tier] ?? 0);
    }

    private zoomToFeature(feature: Feature): void {
        const mapInstance = this.map().mapInstance;

        if (!mapInstance) {
            return;
        }

        const bounds = this.getBounds(
            getGeometryPositions(feature.geometry as HighlightableGeometry),
        );

        const verticalOffset = this.hasCard(feature) ? -80 : 0;

        mapInstance.fitBounds(bounds, {
            maxZoom: ZoomLevel.High + 0.5,
            padding: 20,
            offset: [0, verticalOffset],
        });
    }

    private zoomToRoute(plan: RoutePlan, mode: TravelMode): void {
        const mapInstance = this.map().mapInstance;

        if (!mapInstance) {
            return;
        }

        const bounds = this.getBounds(plan[mode]?.path ?? plan.dragon.path);

        mapInstance.fitBounds(bounds, {
            maxZoom: ZoomLevel.High + 0.5,
            padding: {
                top: 150,
                left: 20,
                right: 20,
                bottom: 280,
            },
            offset: [0, 0],
        });
    }

    private getBounds(positions: Position[]): LngLatBounds {
        return positions.reduce(
            (initialBounds, position) => initialBounds.extend(position as LngLatLike),
            new LngLatBounds(),
        );
    }

    private getHighlightLayerType(
        geometryType: HighlightableGeometry['type'],
    ): 'polygon' | 'line' | 'point' {
        const layerTypes = {
            Polygon: 'polygon',
            MultiPolygon: 'polygon',
            LineString: 'line',
            MultiLineString: 'line',
            MultiPoint: 'point',
            Point: 'point',
        } as const;
        return layerTypes[geometryType];
    }

    private hasCard({ properties }: Feature): boolean {
        return !!properties.description;
    }

    private buildGradientUrl(): string {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, 'rgba(250, 247, 239, 0.75)');
        gradient.addColorStop(1, 'rgba(250, 247, 239, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 256);
        return canvas.toDataURL();
    }

    private getLocalizedLabelLayout(
        layout: SymbolLayerSpecification['layout'],
    ): SymbolLayerSpecification['layout'] {
        const language = this.language();
        return {
            ...layout,
            'text-field': ['coalesce', ['get', `name_${language}`], ['get', 'name']],
        };
    }
}
