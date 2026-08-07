import { ChangeDetectionStrategy, Component, Inject, OnDestroy } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { LocationData } from '../../models';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject } from 'rxjs';
import { AreaPipe, LocalizePipe } from '../../pipes';
import { APP_TITLE, DISPLAYED_TYPES } from '../../constants';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';

@Component({
    selector: 'coiaf-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIcon, MatIconButton, AreaPipe, LocalizePipe, TitleCasePipe],
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
})
export class CardComponent implements OnDestroy {
    goToLocation$ = new Subject<void>();

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly showType = DISPLAYED_TYPES.includes(this.data.type);

    constructor(
        @Inject(MAT_BOTTOM_SHEET_DATA) protected data: LocationData,
        private bottomSheetRef: MatBottomSheetRef,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar,
        private store: Store,
    ) {}

    ngOnDestroy(): void {
        this.goToLocation$.complete();
    }

    async share(): Promise<void> {
        if (navigator.share) {
            await navigator.share({
                title: `${this.data.name} | ${APP_TITLE}`,
                text: `${this.data.name} • ${this.data.type}`,
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

    close(): void {
        this.bottomSheetRef.dismiss();
    }
}
