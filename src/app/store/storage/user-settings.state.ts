import { Language } from '../../models';
import { CenterZoomBearing } from 'maplibre-gl';
import { Action, NgxsOnInit, Selector, State, StateContext } from '@ngxs/store';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE } from '../../constants';
import { SetLanguage, SetPosition } from './user-settings.actions';

export interface UserSettingsStateModel {
    language?: Language;
    position?: CenterZoomBearing;
}

@State<UserSettingsStateModel>({
    name: 'userSettings',
    defaults: {},
})
export class UserSettingsState implements NgxsOnInit {
    @Selector()
    static language({ language }: UserSettingsStateModel): Language {
        return language;
    }

    @Selector()
    static position({ position }: UserSettingsStateModel): CenterZoomBearing {
        return position;
    }

    ngxsOnInit({ getState, dispatch }: StateContext<UserSettingsStateModel>): void {
        const { language } = getState();

        if (language) {
            return;
        }

        const userLocale = navigator.language;
        const userLanguage =
            AVAILABLE_LANGUAGES.find(lang => userLocale.startsWith(lang)) ?? DEFAULT_LANGUAGE;

        if (userLanguage) {
            dispatch(new SetLanguage(userLanguage));
        }
    }

    @Action(SetLanguage)
    setLanguage(
        { patchState }: StateContext<UserSettingsStateModel>,
        { language }: SetLanguage,
    ): void {
        patchState({ language });
    }

    @Action(SetPosition)
    setPosition(
        { patchState }: StateContext<UserSettingsStateModel>,
        { position }: SetPosition,
    ): void {
        patchState({ position });
    }
}