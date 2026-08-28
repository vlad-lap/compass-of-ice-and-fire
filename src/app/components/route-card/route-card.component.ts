import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { CardBodyDirective, CardComponent, CardTitleDirective } from '../card/card.component';
import { DurationPipe } from '../../pipes';
import { LanguagesState } from '../../store';
import { TravelMode } from '../../models';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { RouteService } from '../../services';
import { SpeedKmH } from '../../utils';
import { SkeletonLoaderComponent } from '../skeleton-loader/skeleton-loader.component';

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
        () => this.modes.indexOf(this.routeService.selectedMode())
    );

    protected readonly modes: TravelMode[] = ['foot', 'horse', 'ship', 'dragon'];

    protected readonly SpeedKmH = SpeedKmH;

    protected readonly icons: Partial<Record<TravelMode, string>> = {
        foot: 'directions_walk',
        ship: 'sailing',
    };

    protected readonly svgIcons: Partial<Record<TravelMode, string>> = {
        horse: 'horse',
        dragon: 'dragon',
    };

    constructor(
        private store: Store,
        private routeService: RouteService,
    ) {}

    onTabChange(index: number): void {
        this.routeService.selectedMode.set(this.modes[index]);
    }
}
