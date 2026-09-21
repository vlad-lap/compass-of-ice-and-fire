import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RoutePlan, TravelMode } from '../../../models';
import { DurationPipe } from '../../../pipes';
import { RouteIconsComponent } from '../../ui';

@Component({
    selector: 'coiaf-route-tooltip',
    imports: [DurationPipe, RouteIconsComponent],
    templateUrl: './route-tooltip.component.html',
    styleUrl: './route-tooltip.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteTooltipComponent {
    plan = input<RoutePlan>();
    mode = input<TravelMode>();
}
