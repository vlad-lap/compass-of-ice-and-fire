import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../models';
import { LocalizePipe } from '../../pipes';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';
import { SubtitleComponent } from '../subtitle/subtitle.component';

@Component({
    selector: 'coiaf-tooltip',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: 'tooltip.component.html',
    styleUrl: './tooltip.component.scss',
    imports: [LocalizePipe, SubtitleComponent],
})
export class TooltipComponent {
    readonly location = input.required<FeatureData>();
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(private store: Store) {}
}
