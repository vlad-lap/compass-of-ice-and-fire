import {
    ChangeDetectionStrategy,
    Component,
    computed,
    Directive,
    ElementRef,
    Inject,
    OnDestroy,
    signal,
    viewChild,
    ViewEncapsulation,
} from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Subject } from 'rxjs';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';
import { isNil } from 'lodash';
import { Clipboard } from '@angular/cdk/clipboard';
import { Title } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';

const MAX_CARD_HEIGHT_VIEWPORT_RATIO = 0.8;

const CARD_HEIGHT_ABOVE_HEADER = 28;

export interface CardData {
    height?: number;
    minHeight?: number;
    maxHeight?: number;
}

@Directive({
    selector: '[coiafCardTitle]',
    host: {
        class: 'card-title',
    },
})
export class CardTitleDirective {}

@Directive({
    selector: '[coiafCardActions]',
    host: {
        class: 'card-actions',
    },
})
export class CardActionsDirective {}

@Directive({
    selector: '[coiafCardBody]',
    host: {
        class: 'card-body',
    },
})
export class CardBodyDirective {}

@Component({
    selector: 'coiaf-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIcon, MatIconButton],
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
    encapsulation: ViewEncapsulation.None,
    host: {
        class: 'coiaf-card',
        '[style.height.px]': 'cardHeight()',
        '[style.max-height.px]': 'maxCardHeight()',
        '[class.resizing]': 'isResizing()',
    },
})
export class CardComponent implements OnDestroy {
    goToLocation$ = new Subject<void>();

    readonly header = viewChild('header', { read: ElementRef });
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly cardHeight = signal<number | null>(this.limitByViewport(this.data.height));
    protected readonly maxCardHeight = computed<number>(() =>
        this.limitByViewport(Math.max(this.cardHeight() ?? 0, this.data.maxHeight ?? 0)),
    );
    protected readonly isResizing = signal(false);
    protected readonly minCardHeight = computed<number>(() => {
        const headerHeight =
            parseInt(getComputedStyle(this.header()?.nativeElement).height) +
            CARD_HEIGHT_ABOVE_HEADER;
        return this.limitByViewport(Math.max(headerHeight, this.data.minHeight ?? 0));
    });

    private resizeStartY = 0;
    private resizeStartHeight = 0;

    constructor(
        @Inject(MAT_BOTTOM_SHEET_DATA) protected data: CardData,
        private bottomSheetRef: MatBottomSheetRef,
        private store: Store,
        private elementRef: ElementRef<HTMLElement>,
        private title: Title,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar,
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
                title: this.title.getTitle(),
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
        this.cardHeight.set(this.limitByViewport(Math.max(height, this.minCardHeight())));
    };

    private stopResize = (): void => {
        this.isResizing.set(false);
        document.removeEventListener('pointermove', this.onResize);
        document.removeEventListener('pointerup', this.stopResize);
    };

    private limitByViewport(height: number): number {
        if (isNil(height)) {
            return null;
        }
        const maxHeight = window.innerHeight * MAX_CARD_HEIGHT_VIEWPORT_RATIO;
        return Math.min(height, maxHeight);
    }
}
