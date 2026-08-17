import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../models';
import { LocalizePipe } from '../../pipes';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';
import { SubtitleComponent } from '../subtitle/subtitle.component';
import { SearchService } from '../../services';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Subject } from 'rxjs';

export interface TooltipOptions {
    showCloseButton?: boolean;
    showDetailsLink?: boolean;
}

@Component({
    selector: 'coiaf-tooltip',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: 'tooltip.component.html',
    styleUrl: './tooltip.component.scss',
    imports: [LocalizePipe, SubtitleComponent, MatIcon, MatIconButton],
})
export class TooltipComponent {
    readonly location = input.required<FeatureData>();
    readonly options = input<TooltipOptions>();
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    readonly close$ = new Subject<void>();

    constructor(
        private store: Store,
        private searchService: SearchService,
    ) {}

    setSelectedId(): void {
        const id = this.location().id;
        this.searchService.selectedId.set(id);
    }

    close(): void {
        this.close$.next();
        this.close$.complete();
    }
}
