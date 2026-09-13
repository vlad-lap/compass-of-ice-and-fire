import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FeatureData } from '../../../models';
import { CoatsOfArmsState, LanguagesState } from '../../../store';
import { Store } from '@ngxs/store';
import { MatDialog } from '@angular/material/dialog';
import { HouseDialogComponent } from '../dialog/house-dialog.component';
import { SkeletonLoaderComponent } from '../../ui';
import { MatRipple } from '@angular/material/core';
import { CoatOfArmsUrlPipe, LocalizePipe } from '../../../pipes';
import { AsyncPipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'coiaf-house-preview',
    imports: [
        SkeletonLoaderComponent,
        MatRipple,
        CoatOfArmsUrlPipe,
        AsyncPipe,
        MatIcon,
        LocalizePipe,
    ],
    templateUrl: './house-preview.component.html',
    styleUrl: './house-preview.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HousePreviewComponent {
    readonly location = input.required<FeatureData>();
    readonly variant = input<'full' | 'short'>('short');
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly loading = this.store.selectSignal(CoatsOfArmsState.loading);

    readonly clickable = computed<boolean>(() => {
        const id = this.location()?.id;
        const coatOfArms = this.store.selectSnapshot(CoatsOfArmsState.byId(id));
        const loading = this.loading();
        return !!coatOfArms && !loading;
    })

    constructor(
        private store: Store,
        private dialog: MatDialog,
    ) {}

    openHouseDialog(): void {
        if (!this.clickable()) {
            return;
        }

        this.dialog.open(HouseDialogComponent, {
            data: this.location(),
            panelClass: 'coiaf-house-dialog',
        });
    }
}
