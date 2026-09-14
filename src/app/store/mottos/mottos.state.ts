import { LanguageDict } from '../../models';
import { Action, createSelector, Selector, State, StateContext } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { UserSettingsState, UserSettingsStateModel } from '../local-storage';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { GetMottos } from './mottos.actions';
import { DEFAULT_LANGUAGE } from '../../constants';

type MottosStateModel = LanguageDict<Record<string, string>>;

@State<MottosStateModel>({
    name: 'mottos',
    defaults: {} as MottosStateModel,
})
@Injectable()
export class MottosState {
    @Selector([MottosState, UserSettingsState])
    static mottos(
        state: MottosStateModel,
        { language }: UserSettingsStateModel,
    ): Record<string, string> {
        return state[language];
    }

    static byHouse(house: string) {
        return createSelector(
            [MottosState, UserSettingsState],
            (state: MottosStateModel, { language }: UserSettingsStateModel): string =>
                state[language]?.[house],
        );
    }

    constructor(private http: HttpClient) {}

    @Action(GetMottos)
    getMottos(
        { patchState }: StateContext<MottosStateModel>,
        { language }: GetMottos,
    ): Observable<Record<string, string>> {
        const path = language === DEFAULT_LANGUAGE ? 'data' : `languages/${language}`;
        const url = `${path}/mottos.json`;

        return this.http
            .get<Record<string, string>>(url)
            .pipe(tap(mottos => patchState({ [language]: mottos })));
    }
}