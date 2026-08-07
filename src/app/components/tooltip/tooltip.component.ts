import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LocationData } from '../../models';
import { AreaPipe, LocalizePipe } from '../../pipes';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';
import { TitleCasePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { DISPLAYED_TYPES } from '../../constants';

@Component({
    selector: 'coiaf-tooltip',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: 'tooltip.component.html',
    styleUrl: './tooltip.component.scss',
    imports: [AreaPipe, LocalizePipe, TitleCasePipe, MatIcon],
})
export class TooltipComponent {
    readonly location = input.required<LocationData>();
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly showType = computed<boolean>(() => DISPLAYED_TYPES.includes(this.location()?.type));

    constructor(private store: Store) {}
}
