import { computed, effect, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import { Store } from '@ngxs/store';
import { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import {
    GeodataDict,
    RoutePlan,
    RoutePointValue,
    BarrierCrossing,
    RouteEndpoints,
    RouteWorkerInit,
    RouteWorkerRequest,
    RouteWorkerResponse,
    RoutingGeodata,
    TravelMode,
    FeatureData,
} from '../models';
import {
    AddHistoryItem,
    GEODATA_STATE_TOKEN,
    GeodataState,
    LanguagesState,
    UserSettingsState,
} from '../store';
import {
    getCentralPoint,
    getGeometryPositions,
    getMiddleMultiPoint,
    HighlightableGeometry,
    isFeatureData, localizeProperty,
    planRoutes,
} from '../utils';
import { UrlParts, UrlService } from './url.service';

export const ROUTE_PATH = 'route';
import { isNil, mapValues, omitBy, pickBy } from 'lodash';
import { Title } from '@angular/platform-browser';
import { APP_TITLE } from '../constants';

function buildRoutingGeodata(
    geodata: GeodataDict<FeatureCollection>,
    barrierCrossings: BarrierCrossing[],
): RoutingGeodata {
    return {
        continents: geodata.continents,
        islands: geodata.islands,
        rivers: geodata.rivers,
        theWall: geodata.theWall,
        forests: geodata.forests,
        deserts: geodata.deserts,
        swamps: geodata.swamps,
        mountains: geodata.mountains,
        lakes: geodata.lakes,
        seas: geodata.seas,
        bays: geodata.bays,
        straits: geodata.straits,
        locations: geodata.locations,
        barrierCrossings,
    } as RoutingGeodata;
}

// Which route to show when the one on screen does not exist for the new pair of points: the first that
// does, staying as close to what the user had as the plan allows.
const MODE_FALLBACK_ORDER: TravelMode[] = [
    'foot',
    'horse',
    'ship',
    'footShip',
    'horseShip',
    'dragon',
];

@Injectable({
    providedIn: 'root',
})
export class RouteService implements OnDestroy {
    readonly routeEnabled = signal<boolean>(false);
    readonly endpoints = signal<RouteEndpoints>(null);
    readonly plan = signal<RoutePlan | null>(null);
    readonly loading = signal(false);
    readonly selectedMode = signal<TravelMode>('foot');

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    readonly endpointPositions = computed<{ from: Position | null; to: Position | null }>(() => {
        const routeEndpoints = this.endpoints();
        return {
            from: this.resolvePosition(routeEndpoints?.from),
            to: this.resolvePosition(routeEndpoints?.to),
        };
    });

    private readonly worker =
        typeof Worker !== 'undefined'
            ? new Worker(new URL('./route.worker', import.meta.url))
            : null;

    private requestId = 0;
    private initializedGeodataState: unknown = null;
    private pathBeforeRoute = '';

    constructor(
        private url: UrlService,
        private store: Store,
        private title: Title,
    ) {
        effect(() => {
            const routeEnabled = this.routeEnabled();
            const endpoints = this.endpoints();

            if (routeEnabled) {
                if (this.url.path !== ROUTE_PATH) {
                    this.pathBeforeRoute = this.url.path;
                }

                const query = mapValues(endpoints, point => this.getQueryParam(point));
                this.url.navigate(ROUTE_PATH, omitBy(query, isNil));
            } else if (this.url.path === ROUTE_PATH) {
                this.url.navigate(this.pathBeforeRoute, null);
            }
        });

        effect(() => this.title.setTitle(this.buildTitle()));

        effect(() => {
            if (!this.routeEnabled()) {
                this.reset();
            }
        });

        effect(() => {
            const endpoints = this.endpoints();
            const pointFeatures = pickBy(endpoints, isFeatureData);

            Object.values(pointFeatures)
                .forEach((feature: FeatureData) => this.store.dispatch(new AddHistoryItem(feature)));
        });

        effect(() => {
            const endpoints = this.endpoints();
            const from = this.resolvePosition(endpoints?.from);
            const to = this.resolvePosition(endpoints?.to);
            this.planRoute(from, to);
        });

        effect(() => {
            const plan = this.plan();
            const mode = untracked(this.selectedMode);

            if (plan && !plan[mode]) {
                this.selectedMode.set(MODE_FALLBACK_ORDER.find(candidate => plan[candidate]) ?? 'dragon');
            }
        });

        this.applyUrl({ path: this.url.path, query: this.url.query });
        this.url.onHistoryNavigation(urlParts => this.applyUrl(urlParts));

        if (this.worker) {
            this.worker.onmessage = ({ data }: MessageEvent<RouteWorkerResponse>) => {
                if (data.requestId === this.requestId) {
                    this.plan.set(data.plan);
                    this.loading.set(false);
                }
            };

            this.worker.onerror = () => {
                this.plan.set(null);
                this.loading.set(false);
            };
        }
    }

    ngOnDestroy(): void {
        this.worker?.terminate();
    }

    reset(): void {
        this.endpoints.set(null);
        this.plan.set(null);
        this.loading.set(false);
        this.selectedMode.set('foot');
    }

    private applyUrl({ path, query }: UrlParts): void {
        const routeEnabled = path === ROUTE_PATH;
        this.routeEnabled.set(routeEnabled);

        if (routeEnabled) {
            this.pathBeforeRoute = '';
            this.endpoints.set(query ? mapValues(query, param => this.getPointFromQueryParam(param)) : null);
        }
    }

    private buildTitle(): string {
        const routeEnabled = this.routeEnabled();

        if (!routeEnabled) {
            return APP_TITLE;
        }

        const endpoints = this.endpoints();
        const prefix = this.coreUi().route;

        const endpointsTitle = [endpoints?.from, endpoints?.to]
            .map(point => this.getEndpointTitle(point))
            .filter(Boolean)
            .join(' — ');

        return endpointsTitle
            ? `${prefix}: ${endpointsTitle} | ${APP_TITLE}`
            : `${prefix} | ${APP_TITLE}`;
    }

    private getEndpointTitle(point: RoutePointValue): string {
        if (isFeatureData(point)) {
            const language = this.store.selectSnapshot(UserSettingsState.language);
            return localizeProperty(point, language, 'name');
        }

        if (Array.isArray(point)) {
            return point.join(', ');
        }

        return null;
    }

    private getQueryParam(point: RoutePointValue): string {
        if (isFeatureData(point)) {
            return point.id;
        }

        if (Array.isArray(point)) {
            return point.join(',');
        }

        return null;
    }

    private getPointFromQueryParam(param: string): RoutePointValue {
        const feature = this.store.selectSnapshot(GeodataState.byId(param));

        if (feature) {
            return feature.properties as FeatureData;
        }

        const [lng, lat] = (param ?? '').split(',').map(value => +value);

        if (!!lng && !!lat) {
            return [lng, lat];
        }

        return null;
    }

    private planRoute(from: Position | null, to: Position | null): void {
        const requestId = ++this.requestId;

        if (!from || !to) {
            this.plan.set(null);
            this.loading.set(false);
            return;
        }

        const geodataState = this.store.selectSnapshot(GEODATA_STATE_TOKEN);
        const roadNetwork = this.store.selectSnapshot(GeodataState.roadNetwork);
        const barrierCrossings = this.store.selectSnapshot(GeodataState.barrierCrossings);
        const geodata = buildRoutingGeodata(geodataState, barrierCrossings);

        if (!this.worker) {
            this.plan.set(planRoutes(from, to, geodata, roadNetwork));
            return;
        }

        if (this.initializedGeodataState !== geodataState) {
            this.worker.postMessage({ type: 'init', geodata, roadNetwork } satisfies RouteWorkerInit);
            this.initializedGeodataState = geodataState;
        }

        this.loading.set(true);
        this.worker.postMessage({ type: 'plan', requestId, from, to } satisfies RouteWorkerRequest);
    }

    private resolvePosition(value: RoutePointValue): Position | null {
        if (Array.isArray(value)) {
            return value;
        }
        if (!isFeatureData(value)) {
            return null;
        }

        const feature = this.store.selectSnapshot(GeodataState.byId(value.id));
        return feature ? this.getRoutePoint(feature) : null;
    }

    private getRoutePoint(feature: Feature): Position {
        switch (feature.geometry.type) {
            case 'Point':
                return feature.geometry.coordinates;
            case 'MultiPoint':
                return getMiddleMultiPoint(feature.geometry);
            case 'Polygon':
            case 'MultiPolygon':
                return getCentralPoint(feature.geometry as Polygon | MultiPolygon);
            default:
                return getGeometryPositions(feature.geometry as HighlightableGeometry)[0];
        }
    }
}
