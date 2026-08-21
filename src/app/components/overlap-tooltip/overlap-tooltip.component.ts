import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatActionList, MatListItem } from '@angular/material/list';
import { Store } from '@ngxs/store';
import { GeodataState, LanguagesState } from '../../store';
import { FeatureData } from '../../models';
import { LocalizePipe } from '../../pipes';
import { TitleCasePipe } from '@angular/common';
import { SearchService } from '../../services';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'coiaf-overlap-tooltip',
    imports: [MatActionList, MatListItem, LocalizePipe, TitleCasePipe, MatIcon],
    templateUrl: './overlap-tooltip.component.html',
    styleUrl: './overlap-tooltip.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlapTooltipComponent {
    readonly overlap = input.required<string[]>();
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    readonly overlapFeatures = computed<FeatureData[]>(() =>
        this.overlap()?.map(
            id => this.store.selectSnapshot(GeodataState.byId(id))?.properties as FeatureData,
        ),
    );

    constructor(
        private store: Store,
        private searchService: SearchService,
    ) {}

    setSelectedId(id: string): void {
        this.searchService.selectedId.set(id);
    }
}
