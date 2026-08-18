import { effect, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Store } from '@ngxs/store';
import { UrlService } from './url.service';
import { FeatureData } from '../models';
import { AddHistoryItem, GeodataState, UserSettingsState } from '../store';
import { APP_TITLE } from '../constants';

@Injectable({
    providedIn: 'root',
})
export class SearchService {
    selectedId = signal<string>(null);
    language = this.store.selectSignal(UserSettingsState.language);

    constructor(
        private title: Title,
        private store: Store,
        private url: UrlService,
    ) {
        effect(() => {
            const selectedId = this.selectedId();
            const featureData = selectedId
                ? this.store.selectSnapshot(GeodataState.byId(selectedId))?.properties as FeatureData
                : null;

            this.setUrl(featureData);
            this.setTitle(featureData);

            if (featureData) {
                this.store.dispatch(new AddHistoryItem(featureData));
            }
        });

        const id = this.url.path;
        if (id) {
            this.selectedId.set(id);
        }
    }

    displayFn = (option: FeatureData): string => {
        const language = this.language();
        return option?.[`name_${language}`] ?? option?.name;
    };

    setUrl(value: FeatureData): void {
        this.url.path = value?.id;
    }

    setTitle(value: FeatureData): void {
        const title = value ? `${this.displayFn(value)} | ${APP_TITLE}` : APP_TITLE;
        this.title.setTitle(title);
    }
}
