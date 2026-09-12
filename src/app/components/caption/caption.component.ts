import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../models';
import { CoatsOfArmsState, LanguagesState } from '../../store';
import { Store } from '@ngxs/store';
import { AreaPipe, CoatOfArmsUrlPipe, LocalizePipe } from '../../pipes';
import { MatIcon } from '@angular/material/icon';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { SkeletonLoaderComponent } from '../skeleton-loader/skeleton-loader.component';

@Component({
    selector: 'coiaf-caption',
    imports: [
        CommonModule,
        AreaPipe,
        LocalizePipe,
        MatIcon,
        TitleCasePipe,
        CoatOfArmsUrlPipe,
        SkeletonLoaderComponent,
    ],
    templateUrl: './caption.component.html',
    styleUrl: './caption.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionComponent {
    readonly location = input.required<FeatureData>();
    readonly variant = input<'full' | 'short'>('short');
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly loading = this.store.selectSignal(CoatsOfArmsState.loading);

    constructor(private store: Store) {}
}
