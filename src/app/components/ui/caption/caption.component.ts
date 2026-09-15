import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../../models';
import { LanguagesState } from '../../../store';
import { Store } from '@ngxs/store';
import { AreaPipe, LocalizePipe } from '../../../pipes';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { SearchService } from '../../../services';

@Component({
    selector: 'coiaf-caption',
    imports: [CommonModule, AreaPipe, LocalizePipe, TitleCasePipe],
    templateUrl: './caption.component.html',
    styleUrl: './caption.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionComponent {
    readonly location = input.required<FeatureData>();
    readonly clickable = input<boolean>(false);
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(
        private store: Store,
        private searchService: SearchService,
    ) {}

    setSelectedId(id: string): void {
        this.searchService.selectedId.set(id);
    }
}
