import { ResolveFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { inject } from '@angular/core';
import {
    GetCoreUI,
    GetGeodata,
    GetMottos,
    GetOptionGroups,
    GetBarrierCrossings,
    GetRoadNetwork,
} from '../store';
import { AVAILABLE_LANGUAGES, GEODATA_URLS } from '../constants';
import { GeodataType } from '../models';

export const mapResolver: ResolveFn<void> = () => {
    const store = inject(Store);
    const geodataActions = Object.keys(GEODATA_URLS).map((key: GeodataType) => new GetGeodata(key));
    return store.dispatch([
        new GetCoreUI(),
        new GetOptionGroups(),
        ...geodataActions,
        new GetRoadNetwork(),
        new GetBarrierCrossings(),
        ...AVAILABLE_LANGUAGES.map(language => new GetMottos(language)),
    ]);
};
