import { FeatureCollection, Feature, Point, Polygon, MultiPolygon, Position } from 'geojson';
import { Action, createSelector, Selector, State, StateContext, StateToken } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GetGeodata } from './geodata.actions';
import { Observable, tap } from 'rxjs';
import { GEODATA_URLS } from '../../constants';
import { FeatureData, GeodataDict, GeodataType } from '../../models';
import { getCentralPoint, getLocationsSearchOptions, getMiddleMultiPoint, getSearchOptions } from '../../utils';
import { flatten, mapValues, omit } from 'lodash';

type GeodataStateModel = GeodataDict<FeatureCollection>;

export const GEODATA_STATE_TOKEN = new StateToken<GeodataStateModel>('geodata');

const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };

const LABEL_POSITIONS: Record<string, Position> = {
    westeros: [12.61, 18.39],
    essos: [78.05, 2.9],
    sothoryos: [66.83, -36],
    ulthos: [119.25, -37.3],
    riverlands: [13.65, 10.12],
    'the-vale': [22.17, 11.84],
    'the-westerlands': [8.51, 8.8],
    crownlands: [19.55, 6.19],
    stormlands: [18.03, -2.06],
    'the-reach': [11.49, 0.5],
    dorne: [14.01, -7.87],
    'the-iron-islands': [5.82, 14.1],
    'country-valyrian-freehold': [50.77, -21.76],
    'country-kingdom-of-sarnor': [55.66, 8.37],
    'country-yi-ti': [105.38, -12.74],
    'country-ibben': [79.32, 25.23],
    'country-kingdoms-of-the-ifeqevron': [75.73, 13.04],
    'country-jogos-nhai': [104.24, 2.76],
    'country-mossovy': [120.75, 8.19],
    'country-realm-of-jhogwin': [90.28, 12.11],
    'region-dornish-marches': [13.72, -3.5],
    'desert-the-red-waste': [82.14, -9.45],
    'wasteland-the-grey-waste': [122.35, 0.95],
};

@State<GeodataStateModel>({
    name: GEODATA_STATE_TOKEN,
    defaults: {},
})
@Injectable()
export class GeodataState {
    @Selector()
    static searchOptions(state: GeodataStateModel): Record<string, FeatureData[]> {
        const allOptionsDict = mapValues(state, value => getSearchOptions(value));
        const locationsOptionsDict = getLocationsSearchOptions(
            state.locations ?? ({} as FeatureCollection),
        );
        return {
            ...omit(allOptionsDict, ['locations', 'kingdomBorders', 'mountainRidges']),
            ...locationsOptionsDict,
        };
    }

    static geodata(key: GeodataType) {
        return createSelector(
            [GeodataState],
            (state: GeodataStateModel): FeatureCollection => state[key],
        );
    }

    static labelPoints(key: GeodataType) {
        return createSelector(
            [GeodataState],
            (state: GeodataStateModel): FeatureCollection<Point> => {
                const collection = state[key];
                if (!collection) {
                    return EMPTY;
                }

                const features: Feature<Point>[] = collection.features
                    .filter(feature => feature.properties?.name)
                    .map(feature => {
                        const coordinates = GeodataState.getLabelPosition(feature);

                        return {
                            ...feature,
                            geometry: { type: 'Point', coordinates },
                        };
                    });

                return { ...collection, features };
            },
        );
    }

    static byId(id: string) {
        return createSelector([GeodataState], (state: GeodataStateModel): Feature => {
            const allFeatures = Object.values(state).map(({ features }) => features);
            return flatten(allFeatures).find(feature => feature.properties.id === id);
        });
    }

    private static getLabelPosition(feature: Feature): Position {
        if (LABEL_POSITIONS[feature.properties.id]) {
            return LABEL_POSITIONS[feature.properties.id];
        } else if (feature.geometry.type === 'MultiPoint') {
            return getMiddleMultiPoint(feature.geometry);
        } else {
            return getCentralPoint(feature.geometry as Polygon | MultiPolygon);
        }
    }

    constructor(private http: HttpClient) {}

    @Action(GetGeodata)
    getGeodata(
        { patchState }: StateContext<GeodataStateModel>,
        { key }: GetGeodata,
    ): Observable<FeatureCollection> {
        return this.http
            .get<FeatureCollection>(GEODATA_URLS[key])
            .pipe(tap(geodata => patchState({ [key]: geodata })));
    }
}
