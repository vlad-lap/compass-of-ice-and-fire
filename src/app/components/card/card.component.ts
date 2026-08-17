import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    Inject,
    OnDestroy,
    signal,
    viewChild,
} from '@angular/core';
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
import { SubtitleComponent } from '../subtitle/subtitle.component';
import { localizeProperty } from '../../utils';

const MAX_CARD_HEIGHT_VIEWPORT_RATIO = 0.8;
const DEFAULT_MAX_CARD_HEIGHT = 300;

const CARD_HEIGHT_ABOVE_HEADER = 28;

@Component({
    selector: 'coiaf-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIcon, MatIconButton, LocalizePipe, SubtitleComponent],
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

    readonly header = viewChild('header', { read: ElementRef });
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly cardHeight = signal<number | null>(null);
    protected readonly maxCardHeight = computed<number>(() =>
        Math.max(this.cardHeight() ?? 0, DEFAULT_MAX_CARD_HEIGHT),
    );
    protected readonly isResizing = signal(false);
    protected readonly minCardHeight = computed<number>(
        () =>
            parseInt(getComputedStyle(this.header()?.nativeElement).height) +
            CARD_HEIGHT_ABOVE_HEADER,
    );

    private resizeStartY = 0;
    private resizeStartHeight = 0;

    constructor(
        @Inject(MAT_BOTTOM_SHEET_DATA) protected data: FeatureData,
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

    close(): void {
        this.bottomSheetRef.dismiss();
    }

    preventTouchDefault = (event: TouchEvent): void => {
        event.preventDefault();
        event.stopPropagation();
    };

    private onResize = (event: PointerEvent): void => {
        const height = this.resizeStartHeight + this.resizeStartY - event.clientY;
        const maxHeight = window.innerHeight * MAX_CARD_HEIGHT_VIEWPORT_RATIO;
        this.cardHeight.set(Math.min(Math.max(height, this.minCardHeight()), maxHeight));
    };

    private stopResize = (): void => {
        this.isResizing.set(false);
        document.removeEventListener('pointermove', this.onResize);
        document.removeEventListener('pointerup', this.stopResize);
    };
}
