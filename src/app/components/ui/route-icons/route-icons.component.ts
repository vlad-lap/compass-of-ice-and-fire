import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ModeIcon, TravelMode } from '../../../models';
import { MODE_ICONS } from '../../../constants';

type IconSize = 'sm' | 'md' | 'lg';

@Component({
    selector: 'coiaf-route-icons',
    imports: [MatIcon],
    templateUrl: './route-icons.component.html',
    styleUrl: './route-icons.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.small]': "size() === 'sm'",
        '[class.medium]': "size() === 'md'",
        '[class.large]': "size() === 'lg'",
    },
})
export class RouteIconsComponent {
    readonly mode = input.required<TravelMode>();
    readonly size = input<IconSize>('md');

    protected readonly modeIcons: Record<TravelMode, ModeIcon[]> = {
        foot: [MODE_ICONS.foot],
        horse: [MODE_ICONS.horse],
        footShip: [MODE_ICONS.foot, MODE_ICONS.ship],
        horseShip: [MODE_ICONS.horse, MODE_ICONS.ship],
        ship: [MODE_ICONS.ship],
        dragon: [MODE_ICONS.dragon],
    };
}
