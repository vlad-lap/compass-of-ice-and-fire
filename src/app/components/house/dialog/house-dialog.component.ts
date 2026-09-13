import { ChangeDetectionStrategy, Component, Inject, ViewEncapsulation } from '@angular/core';
import { LanguagesState, MottosState } from '../../../store';
import { Store } from '@ngxs/store';
import { MAT_DIALOG_DATA, MatDialogClose, MatDialogContent, MatDialogTitle, } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { FeatureData } from '../../../models';
import { CoatOfArmsUrlPipe, LocalizePipe } from '../../../pipes';
import { AsyncPipe } from '@angular/common';

@Component({
    selector: 'coiaf-house-dialog',
    imports: [
        MatDialogClose,
        MatDialogContent,
        MatDialogTitle,
        MatIcon,
        MatIconButton,
        LocalizePipe,
        AsyncPipe,
        CoatOfArmsUrlPipe,
    ],
    templateUrl: './house-dialog.component.html',
    styleUrl: './house-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class HouseDialogComponent {
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly motto = this.store.selectSignal(MottosState.byHouse(this.data.ClaimedBy));

    constructor(
        @Inject(MAT_DIALOG_DATA) protected data: FeatureData,
        private store: Store,
    ) {}
}
