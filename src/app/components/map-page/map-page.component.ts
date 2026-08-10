import {
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    signal,
    ViewContainerRef,
    viewChild,
    computed,
    effect,
} from '@angular/core';
import { Store } from '@ngxs/store';
import {
    GeoJSONSourceComponent,
    ImageSourceComponent,
    LayerComponent,
    MapComponent,
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
    Popup,
    SymbolLayerSpecification,
} from 'maplibre-gl';
import { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';
import {
    INITIAL_MAP_CENTER,
    LONG_PRESS_DURATION_MS,
    CLICKABLE_LAYER_IDS,
    ZOOM_DURATION,
    ZOOM_STEP,
    ZoomLevel,
    LONG_PRESSABLE_LAYER_IDS,
    HitRadiusPx,
    LONG_PRESS_TOOLTIP_TIMEOUT_MS,
} from './constants';
import {
    FeatureData,
    GeodataDict,
    GeodataType,
    LineGeodataType,
    LocationTier,
    PolygonGeodataType,
} from '../../models';
import { GEODATA_STATE_TOKEN, GeodataState, LanguagesState } from '../../store';
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
    LOCATION_LABELS_FILTER,
    LOCATIONS_FILTER,
    LOCATIONS_MIN_ZOOM,
    MAP_BOUNDS,
    MAP_STYLE,
    POINTS_PAINT,
    POINTS_SHADOW,
    POLYGONS_PAINT,
    SEARCH_HIGHLIGHT_CIRCLE_PAINT,
    SEARCH_HIGHLIGHT_LINE_LAYOUT,
    SEARCH_HIGHLIGHT_LINE_PAINT,
    SEARCH_HIGHLIGHT_POLYGON_PAINT,
    VOLCANOES_PAINT,
    VOLCANOES_SMOKE_PAINT,
} from './configs';
import {
    buildMaskPolygon,
    getGeometryPositions,
    HighlightableGeometry,
} from '../../utils';
import { MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AboutDialogComponent } from '../about-dialog/about-dialog.component';
import { TooltipComponent } from '../tooltip/tooltip.component';
import { MapSearchComponent } from '../map-search/map-search.component';
import { KeyValuePipe } from '@angular/common';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { CardComponent } from '../card/card.component';
import { takeUntil } from 'rxjs';
import { kebabCase, mapValues } from 'lodash';

@Component({
    selector: 'coiaf-map-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MapComponent,
        GeoJSONSourceComponent,
        ImageSourceComponent,
        LayerComponent,
        MatMiniFabButton,
        MatIcon,
        MatIconButton,
        MapSearchComponent,
        KeyValuePipe,
    ],
    templateUrl: './map-page.component.html',
    styleUrl: './map-page.component.scss',
})
export class MapPageComponent {
    protected readonly map = viewChild.required(MapComponent);
    protected readonly searchComponent = viewChild.required(MapSearchComponent);

    protected readonly language = this.store.selectSignal(LanguagesState.language);
    protected readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly cursorStyle = signal<string>('default');

    protected readonly searchHighlightFeature = signal<Feature>(null);

    protected readonly mapStyle = MAP_STYLE;
    protected readonly ZoomLevel = ZoomLevel;
    protected readonly maxBounds = MAP_BOUNDS;
    protected readonly initialCenter = INITIAL_MAP_CENTER;

    protected readonly geodata: GeodataDict<FeatureCollection> = this.store.selectSnapshot(GEODATA_STATE_TOKEN);

    protected readonly polygonTypes: PolygonGeodataType[] = [
        'continents',
        'kingdoms',
        'countries',
        'regions',
        'seas',
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

    private popup: Popup;
    private tooltipRef: ComponentRef<TooltipComponent>;
    private bottomSheetRef: MatBottomSheetRef;
    private longPressTimer: ReturnType<typeof setTimeout>;
    private longPressTooltipTimer: ReturnType<typeof setTimeout>;

    constructor(
        private store: Store,
        private dialog: MatDialog,
        private bottomSheet: MatBottomSheet,
        private viewContainerRef: ViewContainerRef,
    ) {
        effect(() => {
            const highlight = this.searchHighlightFeature();
            if (highlight && this.hasCard(highlight)) {
                this.openCard(highlight);
            } else {
                this.closeCard();
            }
        });
    }

    onMapLoad(map: Map): void {
        map.touchZoomRotate.disableRotation();

        const feature = this.searchHighlightFeature();
        if (feature) {
            this.zoomToFeature(feature);
        } else {
            const position = JSON.parse(localStorage.getItem('position'));
            if (position) {
                map.jumpTo(position);
            }
        }
    }

    saveCurrentPosition(): void {
        const map = this.map().mapInstance;
        const zoom = map.getZoom();
        const center = map.getCenter();
        localStorage.setItem('position', JSON.stringify({ zoom, center }));
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

    onFeatureEnter({ lngLat, target, features }: MapLayerMouseEvent): void {
        if (!this.hasHover) {
            return;
        }

        const feature = features?.[0];
        if (!feature) {
            return;
        }

        if (this.hasCard(feature)) {
            this.cursorStyle.set('pointer');
        }
        this.showTooltip(target, feature, lngLat);
    }

    onFeatureLeave(): void {
        this.cursorStyle.set('default');
        this.popup?.remove();
        this.popup = null;
        this.tooltipRef?.destroy();
        this.tooltipRef = null;
    }

    onMapDragStart(): void {
        this.cursorStyle.set('grabbing');
        this.cancelLongPress();
    }

    onMapDragEnd(): void {
        this.cursorStyle.set('default');
        this.saveCurrentPosition();
    }

    onLongPressStart(event: MapMouseEvent | MapTouchEvent): void {
        this.cancelLongPress();

        this.longPressTooltipTimer = setTimeout(() => {
            const feature = this.queryRenderedFeature(event, LONG_PRESSABLE_LAYER_IDS);
            const lngLat = this.hasHover
                ? event.lngLat
                : ([event.lngLat.lng, event.lngLat.lat + 0.5] as LngLatLike);

            if (feature) {
                this.showTooltip(event.target, feature, lngLat);
            }
        }, LONG_PRESS_TOOLTIP_TIMEOUT_MS);

        this.longPressTimer = setTimeout(() => {
            this.hideTooltip();
            this.selectFeature(event, LONG_PRESSABLE_LAYER_IDS);
        }, LONG_PRESS_DURATION_MS);
    }

    onLongPressEnd(): void {
        this.cancelLongPress();
    }

    onMapClick(event: MapMouseEvent): void {
        if (this.longPressTimer || this.longPressTooltipTimer) {
            return;
        }

        this.selectFeature(event, CLICKABLE_LAYER_IDS);
    }

    onMapDoubleClick({ lngLat }: MapMouseEvent): void {
        const map = this.map().mapInstance;
        map.flyTo({
            center: lngLat,
            zoom: map.getZoom() + ZOOM_STEP,
            duration: ZOOM_DURATION,
        });
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

    private selectFeature(event: MapMouseEvent | MapTouchEvent, layers: string[]): void {
        const feature = this.queryRenderedFeature(event, layers);

        if (!feature?.properties?.name) {
            return;
        }

        this.searchComponent().setSelectedId(feature.properties.id);
    }

    private queryRenderedFeature(
        { target, point: { x, y } }: MapMouseEvent | MapTouchEvent,
        layers: string[],
    ): MapGeoJSONFeature {
        const [feature] = target.queryRenderedFeatures(
            [
                [x - this.hitRadius, y - this.hitRadius],
                [x + this.hitRadius, y + this.hitRadius],
            ],
            { layers },
        );

        return feature;
    }

    private zoomToFeature(feature: Feature): void {
        const mapInstance = this.map().mapInstance;

        if (!mapInstance) {
            return;
        }

        const bounds = getGeometryPositions(feature.geometry as HighlightableGeometry).reduce(
            (initialBounds, position) => initialBounds.extend(position as LngLatLike),
            new LngLatBounds(),
        );

        const verticalOffset = this.hasCard(feature) ? -80 : 0;

        mapInstance.fitBounds(bounds, {
            maxZoom: ZoomLevel.High + 0.5,
            padding: 30,
            offset: [0, verticalOffset],
        });
    }

    private cancelLongPress(): void {
        this.hideTooltip();
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
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

    private openCard(feature: Feature): void {
        this.onFeatureLeave();

        const bottomSheetRef = (this.bottomSheetRef = this.bottomSheet.open(CardComponent, {
            hasBackdrop: false,
            data: feature.properties as FeatureData,
            panelClass: 'coiaf-card-panel',
        }));

        bottomSheetRef.instance.goToLocation$
            .pipe(takeUntil(bottomSheetRef.afterDismissed()))
            .subscribe(() => this.zoomToFeature(feature));

        bottomSheetRef.afterDismissed().subscribe(() => {
            if (this.bottomSheetRef === bottomSheetRef) {
                this.searchComponent().setSelectedId(null);
            }
        });
    }

    private closeCard(): void {
        this.bottomSheet.dismiss();
    }

    private showTooltip(
        map: MapLayerMouseEvent['target'],
        { geometry, properties }: MapGeoJSONFeature,
        lngLat: LngLatLike,
    ): void {
        const anchor = geometry.type === 'Point' ? (geometry.coordinates as LngLatLike) : lngLat;

        this.hideTooltip();
        this.popup = new Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'coiaf-map-popup',
        })
            .setLngLat(anchor)
            .setDOMContent(this.buildTooltip(properties as FeatureData))
            .addTo(map);
    }

    private hideTooltip(): void {
        this.popup?.remove();
        this.tooltipRef?.destroy();

        if (this.longPressTooltipTimer) {
            clearTimeout(this.longPressTooltipTimer);
            this.longPressTooltipTimer = null;
        }
    }

    private buildTooltip(location: FeatureData): HTMLElement {
        this.tooltipRef = this.viewContainerRef.createComponent(TooltipComponent);
        this.tooltipRef.setInput('location', location);
        this.tooltipRef.changeDetectorRef.detectChanges();
        return this.tooltipRef.location.nativeElement;
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
