import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../models';
import { LocalizePipe } from '../../pipes';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';
import { SubtitleComponent } from '../subtitle/subtitle.component';
import { SearchService } from '../../services';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'coiaf-tooltip',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: 'tooltip.component.html',
    styleUrl: './tooltip.component.scss',
    imports: [LocalizePipe, SubtitleComponent, MatIcon],
})
export class TooltipComponent {
    readonly location = input.required<FeatureData>();
    readonly showDetailsLink = input<boolean>(false);
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(
        private store: Store,
        private searchService: SearchService,
    ) {}

    setSelectedId(): void {
        const id = this.location().id;
        this.searchService.selectedId.set(id);
    }
}
