import { ChangeDetectionStrategy, Component, Inject, OnDestroy } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { FeatureData } from '../../models';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject } from 'rxjs';
import { LocalizePipe } from '../../pipes';
import { APP_TITLE } from '../../constants';
import { Store } from '@ngxs/store';
import { LanguagesState, UserSettingsState } from '../../store';
import { CaptionComponent } from '../subtitle/caption.component';
import { localizeProperty } from '../../utils';
import {
    CardActionsDirective,
    CardBodyDirective,
    CardComponent,
    CardTitleDirective,
} from '../card/card.component';
import { RouteService, SearchService } from '../../services';

@Component({
    selector: 'coiaf-feature-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatIcon,
        MatIconButton,
        LocalizePipe,
        CaptionComponent,
        CardComponent,
        CardTitleDirective,
        CardBodyDirective,
        CardActionsDirective,
    ],
    templateUrl: './feature-card.component.html',
})
export class FeatureCardComponent implements OnDestroy {
    goToLocation$ = new Subject<void>();

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(
        @Inject(MAT_BOTTOM_SHEET_DATA) protected data: FeatureData,
        private bottomSheetRef: MatBottomSheetRef,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar,
        private store: Store,
        private routeService: RouteService,
        private searchService: SearchService,
    ) {}

    ngOnDestroy(): void {
        this.goToLocation$.complete();
    }

    setRouteEndpoint(): void {
        this.searchService.selectedId.set(null);
        this.routeService.routeEnabled.set(true);
        this.routeService.endpoints.set({ from: this.data });
        this.bottomSheetRef.dismiss();
    }

    async share(): Promise<void> {
        if (navigator.share) {
            const language = this.store.selectSnapshot(UserSettingsState.language);
            const name = localizeProperty(this.data, language, 'name');
            const type = localizeProperty(this.data, language, 'type');

            await navigator.share({
                title: `${name} | ${APP_TITLE}`,
                text: `${name} • ${type}`,
                url: window.location.href,
            });
        } else {
            this.clipboard.copy(window.location.href);
            this.snackBar.open('Link copied', null, {
                duration: 1500,
                verticalPosition: 'top',
                horizontalPosition: 'right',
            });
        }
    }
}
