import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ModeIcon, RoutePlan, TravelMode } from '../../../models';
import { MODE_ICONS } from '../../../constants';
import { MatIcon } from '@angular/material/icon';
import { DurationPipe } from '../../../pipes';

@Component({
    selector: 'coiaf-route-tooltip',
    imports: [MatIcon, DurationPipe],
    templateUrl: './route-tooltip.component.html',
    styleUrl: './route-tooltip.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteTooltipComponent {
    plan = input<RoutePlan>();
    mode = input<TravelMode>();

    protected readonly modeIcons: Record<TravelMode, ModeIcon[]> = {
        foot: [MODE_ICONS.foot],
        horse: [MODE_ICONS.horse],
        footShip: [MODE_ICONS.foot, MODE_ICONS.ship],
        horseShip: [MODE_ICONS.horse, MODE_ICONS.ship],
        ship: [MODE_ICONS.ship],
        dragon: [MODE_ICONS.dragon],
    };
}
