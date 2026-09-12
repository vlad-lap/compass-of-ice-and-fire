import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideStore } from '@ngxs/store';
import {
    UserSettingsState,
    GeodataState,
    LanguagesState,
    HistoryState,
    CoatsOfArmsState,
} from './store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes),
        provideHttpClient(),
        provideStore(
            [UserSettingsState, GeodataState, LanguagesState, HistoryState, CoatsOfArmsState],
            withNgxsStoragePlugin({ keys: [UserSettingsState, HistoryState] }),
        ),
    ],
};
