import { ChangeDetectionStrategy, Component, computed, effect } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { CardBodyDirective, CardComponent, CardTitleDirective } from '../card/card.component';
import { DurationPipe } from '../../pipes';
import { LanguagesState } from '../../store';
import { RoutePlan, RouteResult, TravelMode } from '../../models';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { RouteService } from '../../services';
import { SpeedKmH } from '../../utils';
import { SkeletonLoaderComponent } from '../skeleton-loader/skeleton-loader.component';

export interface ModeIcon {
    icon?: string;
    svgIcon?: string;
}

const MODE_ICONS: Partial<Record<TravelMode, ModeIcon>> = {
    foot: { icon: 'directions_walk' },
    horse: { svgIcon: 'horse' },
    ship: { icon: 'sailing' },
    dragon: { svgIcon: 'dragon' },
};

export type RouteStretchKind = 'land' | 'sea';

export interface RouteStretch {
    kind: RouteStretchKind;
    distanceKm: number;
    timeHours: number;
}

function toStretches(route: RouteResult): RouteStretch[] {
    const stretches: RouteStretch[] = [];

    for (const leg of route.legs) {
        const kind: RouteStretchKind = leg.kind === 'sea' ? 'sea' : 'land';
        const current = stretches[stretches.length - 1];

        if (current?.kind === kind) {
            current.distanceKm += leg.distanceKm;
            current.timeHours += leg.timeHours;
        } else {
            stretches.push({ kind, distanceKm: leg.distanceKm, timeHours: leg.timeHours });
        }
    }

    return stretches;
}

@Component({
    selector: 'coiaf-route-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatIcon,
        CardComponent,
        CardTitleDirective,
        CardBodyDirective,
        MatTabGroup,
        MatTab,
        MatTabLabel,
        DurationPipe,
        SkeletonLoaderComponent,
    ],
    templateUrl: './route-card.component.html',
    styleUrl: './route-card.component.scss',
})
export class RouteCardComponent {
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    protected readonly plan = this.routeService.plan;
    protected readonly loading = this.routeService.loading;

    protected readonly selectedIndex = computed<number>(
        () => this.modes().indexOf(this.routeService.selectedMode())
    );

    protected readonly endpoints = this.routeService.endpoints;

    protected readonly modes = computed<TravelMode[]>(() => {
        if (this.loading()) {
            return ['foot', 'horse', 'dragon'];
        }

        const plan = this.plan();
        return (['foot', 'footShip', 'horse', 'horseShip', 'ship', 'dragon'] as TravelMode[])
            .filter(mode => this.isCombinedMode(mode)
                ? this.showCombinedRoute(plan, mode)
                : plan?.[mode]);
    });

    protected readonly SpeedKmH = SpeedKmH;

    protected readonly stretches = computed<Partial<Record<TravelMode, RouteStretch[]>>>(() => {
        const plan = this.plan();

        return this.modes().reduce(
            (byMode, mode) => plan?.[mode] ? { ...byMode, [mode]: toStretches(plan[mode]) } : byMode,
            {},
        );
    });

    protected readonly modeIcons: Record<TravelMode, ModeIcon[]> = {
        foot: [MODE_ICONS.foot],
        horse: [MODE_ICONS.horse],
        footShip: [MODE_ICONS.foot, MODE_ICONS.ship],
        horseShip: [MODE_ICONS.horse, MODE_ICONS.ship],
        ship: [MODE_ICONS.ship],
        dragon: [MODE_ICONS.dragon],
    };

    constructor(
        private store: Store,
        private routeService: RouteService,
    ) {
        effect(() => {
            if (this.loading()) {
                return;
            }

            const modes = this.modes();
            const selectedMode = this.routeService.selectedMode();

            if (!modes.includes(selectedMode)) {
                this.routeService.selectedMode.set(modes[0]);
            }
        });
    }

    onTabChange(index: number): void {
        this.routeService.selectedMode.set(this.modes()[index]);
    }

    getStretchIcon(mode: TravelMode, stretch: RouteStretch): ModeIcon {
        if (stretch.kind === 'sea') {
            return MODE_ICONS.ship;
        }

        return ['horse', 'horseShip'].includes(mode) ? MODE_ICONS.horse : MODE_ICONS.foot;
    }

    private isCombinedMode(mode: TravelMode): boolean {
        return ['footShip', 'horseShip'].includes(mode);
    }

    private showCombinedRoute(
        plan: RoutePlan,
        combinedRouteKey: TravelMode,
    ): boolean {
        const combinedRoute = plan?.[combinedRouteKey];
        const landRouteKey = combinedRouteKey.replace('Ship', '') as TravelMode;
        const landRoute = plan?.[landRouteKey];
        return !!combinedRoute && !plan?.ship && (!landRoute || combinedRoute.timeHours < landRoute.timeHours);
    }
}
