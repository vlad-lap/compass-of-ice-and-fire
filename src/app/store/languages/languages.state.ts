import { LanguageDict, OptionGroupsDict, UiConfig } from '../../models';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { HttpClient } from '@angular/common/http';
import { GetAboutText, GetCoreUI, GetOptionGroups } from './languages.actions';
import { Observable, of, tap } from 'rxjs';
import { Injectable } from '@angular/core';
import { mapValues } from 'lodash';
import { UserSettingsState, UserSettingsStateModel } from '../storage/user-settings.state';

interface LanguagesStateModel {
    coreUi: UiConfig<LanguageDict>;
    optionGroups: OptionGroupsDict<LanguageDict>;
    about: Partial<LanguageDict>;
}

@State<LanguagesStateModel>({
    name: 'languages',
    defaults: {
        coreUi: null,
        optionGroups: null,
        about: {},
    },
})
@Injectable()
export class LanguagesState {
    @Selector([LanguagesState, UserSettingsState])
    static coreUi(
        { coreUi }: LanguagesStateModel,
        { language }: UserSettingsStateModel,
    ): UiConfig<string> {
        return mapValues(coreUi, config => config[language]);
    }

    @Selector([LanguagesState, UserSettingsState])
    static optionGroups(
        { optionGroups }: LanguagesStateModel,
        { language }: UserSettingsStateModel,
    ): OptionGroupsDict<string> {
        return mapValues(optionGroups, config => config[language]);
    }

    @Selector([LanguagesState, UserSettingsState])
    static about({ about }: LanguagesStateModel, { language }: UserSettingsStateModel): string {
        return about[language];
    }

    constructor(private http: HttpClient) {}

    @Action(GetCoreUI)
    getCoreUi({
        patchState,
    }: StateContext<LanguagesStateModel>): Observable<UiConfig<LanguageDict>> {
        return this.http
            .get<UiConfig<LanguageDict>>('languages/ui.json')
            .pipe(tap(coreUi => patchState({ coreUi })));
    }

    @Action(GetOptionGroups)
    getOptionGroups({
        patchState,
    }: StateContext<LanguagesStateModel>): Observable<OptionGroupsDict<LanguageDict>> {
        return this.http
            .get<OptionGroupsDict<LanguageDict>>('languages/option-groups.json')
            .pipe(tap(optionGroups => patchState({ optionGroups })));
    }

    @Action(GetAboutText)
    getAboutText(
        { getState, patchState }: StateContext<LanguagesStateModel>,
        { language }: GetAboutText,
    ): Observable<string> {
        const { about } = getState();

        if (about[language]) {
            return of(about[language]);
        }

        const aboutUrls: LanguageDict = {
            en: 'data/about.md',
            ru: 'languages/ru/about.md',
        };

        return this.http.get(aboutUrls[language], { responseType: 'text' }).pipe(
            tap(text =>
                patchState({
                    about: { ...about, [language]: text },
                }),
            ),
        );
    }
}