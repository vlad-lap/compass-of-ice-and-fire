import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../../store';

@Component({
    selector: 'coiaf-map-scale',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="bar" [style.width.px]="widthPx()"></div>
        <span>{{ distanceKm() }} {{ coreUi().km }}</span>
    `,
    styleUrl: './map-scale.component.scss',
})
export class MapScaleComponent {
    readonly widthPx = input.required<number>();
    readonly distanceKm = input.required<number>();

    protected readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(private store: Store) {}
}
