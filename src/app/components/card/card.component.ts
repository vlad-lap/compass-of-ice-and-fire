import {
    ChangeDetectionStrategy,
    Component, computed,
    ElementRef,
    Inject,
    OnDestroy,
    signal,
} from '@angular/core';
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

const MIN_CARD_HEIGHT_PX = 64;
const MAX_CARD_HEIGHT_VIEWPORT_RATIO = 0.9;
const DEFAULT_MAX_CARD_HEIGHT = 300;

@Component({
    selector: 'coiaf-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIcon, MatIconButton, AreaPipe, LocalizePipe, TitleCasePipe],
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
    host: {
        '[style.height.px]': 'cardHeight()',
        '[style.max-height.px]': 'maxCardHeight()',
        '[class.resizing]': 'isResizing()',
    },
})
export class CardComponent implements OnDestroy {
    goToLocation$ = new Subject<void>();

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly showType = DISPLAYED_TYPES.includes(this.data.type);
    protected readonly cardHeight = signal<number | null>(null);
    protected readonly maxCardHeight = computed<number>(() =>
        Math.max(this.cardHeight() ?? 0, DEFAULT_MAX_CARD_HEIGHT),
    );
    protected readonly isResizing = signal(false);

    private resizeStartY = 0;
    private resizeStartHeight = 0;

    constructor(
        @Inject(MAT_BOTTOM_SHEET_DATA) protected data: LocationData,
        private bottomSheetRef: MatBottomSheetRef,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar,
        private store: Store,
        private elementRef: ElementRef<HTMLElement>,
    ) {}

    ngOnDestroy(): void {
        this.goToLocation$.complete();
        this.stopResize();
    }

    startResize(event: PointerEvent): void {
        event.preventDefault();
        this.isResizing.set(true);
        this.resizeStartY = event.clientY;
        this.resizeStartHeight = this.elementRef.nativeElement.getBoundingClientRect().height;
        document.addEventListener('pointermove', this.onResize);
        document.addEventListener('pointerup', this.stopResize);
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

    private onResize = (event: PointerEvent): void => {
        const height = this.resizeStartHeight + this.resizeStartY - event.clientY;
        const maxHeight = window.innerHeight * MAX_CARD_HEIGHT_VIEWPORT_RATIO;
        this.cardHeight.set(Math.min(Math.max(height, MIN_CARD_HEIGHT_PX), maxHeight));
    };

    private stopResize = (): void => {
        this.isResizing.set(false);
        document.removeEventListener('pointermove', this.onResize);
        document.removeEventListener('pointerup', this.stopResize);
    };
}
