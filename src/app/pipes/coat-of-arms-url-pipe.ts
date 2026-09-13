import { Pipe, PipeTransform } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { FeatureData } from '../models';
import { Store } from '@ngxs/store';
import { CoatsOfArmsState, GetCoatOfArms } from '../store';
import { isUndefined } from 'lodash';

@Pipe({
    name: 'coatOfArmsUrl',
})
export class CoatOfArmsUrlPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(location: FeatureData): Observable<string | null> {
        if (!location) {
            return of(null);
        }

        const { id, ClaimedBy } = location;

        const existingUrl = this.store.selectSnapshot(CoatsOfArmsState.byId(id));

        if (!isUndefined(existingUrl)) {
            return of(existingUrl);
        }

        const overrides = {
            'castle-new-barrel': '/coats-of-arms/House_Fossoway_of_New_Barrel.svg',
            'castle-widows-watch': "/coats-of-arms/House_Flint_of_Widow's_Watch.svg",
            'castle-flints-finger': "/coats-of-arms/House_Flint_of_Flint's_Finger.svg",
        };

        const url = overrides[id] ?? `/coats-of-arms/House_${ClaimedBy}.svg`;
        return this.store
            .dispatch(new GetCoatOfArms(id, url))
            .pipe(map(() => this.store.selectSnapshot(CoatsOfArmsState.byId(id))));
    }
}
