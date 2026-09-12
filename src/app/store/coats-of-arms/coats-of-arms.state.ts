import { Action, createSelector, Selector, State, StateContext } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { GetCoatOfArms } from './coats-of-arms.actions';
import { patch } from '@ngxs/store/operators';

interface CoatsOfArmsStateModel {
    coatsOfArms: Record<string, string>;
    loading: boolean;
}

@State<CoatsOfArmsStateModel>({
    name: 'coatsOfArms',
    defaults: {
        coatsOfArms: {},
        loading: false,
    },
})
@Injectable()
export class CoatsOfArmsState {
    static byId(id: string) {
        return createSelector(
            [CoatsOfArmsState],
            (state: CoatsOfArmsStateModel): string => state.coatsOfArms[id],
        );
    }

    @Selector()
    static loading({ loading }: CoatsOfArmsStateModel): boolean {
        return loading;
    }

    constructor(private http: HttpClient) {}

    @Action(GetCoatOfArms)
    getGeodata(
        { patchState, setState }: StateContext<CoatsOfArmsStateModel>,
        { id, url }: GetCoatOfArms,
    ): Observable<string> {
        patchState({ loading: true });
        return this.http.get(url, { responseType: 'blob' }).pipe(
            map((blob) => URL.createObjectURL(blob)),
            tap({
                next: (objectUrl) =>
                    setState(
                        patch({
                            coatsOfArms: patch({ [id]: objectUrl }),
                        }),
                    ),
                error: () => setState(
                    patch({
                        coatsOfArms: patch({ [id]: null }),
                    }),
                ),
                finalize: () => patchState({ loading: false }),
            }),
        );
    }
}