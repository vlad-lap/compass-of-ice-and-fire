import { FeatureCollection, Feature, Point, Polygon, MultiPolygon, Position } from 'geojson';
import { Action, createSelector, Selector, State, StateContext } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GetGeodata } from './geodata.actions';
import { Observable, tap } from 'rxjs';
import { GEODATA_URLS } from '../../constants';
import { FeatureData, GeodataDict, GeodataType } from '../../models';
import { getCentralPoint, getLocationsSearchOptions, getMiddleMultiPoint, getSearchOptions } from '../../utils';
import { flatten, mapValues, omit } from 'lodash';

const EMPTY: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };

type GeodataStateModel = GeodataDict<FeatureCollection>;

@State<GeodataStateModel>({
    name: 'geodata',
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
            ...omit(allOptionsDict, ['locations', 'kingdomBorders']),
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
        if (feature.properties.id === 'country-valyrian-freehold') {
            return [50.77, -21.76];
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
