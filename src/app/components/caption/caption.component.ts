import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FeatureData } from '../../models';
import { LanguagesState } from '../../store';
import { Store } from '@ngxs/store';
import { AreaPipe, LocalizePipe } from '../../pipes';
import { MatIcon } from '@angular/material/icon';
import { CommonModule, TitleCasePipe } from '@angular/common';

@Component({
    selector: 'coiaf-caption',
    imports: [CommonModule, AreaPipe, LocalizePipe, MatIcon, TitleCasePipe],
    templateUrl: './caption.component.html',
    styleUrl: './caption.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionComponent {
    readonly location = input.required<FeatureData>();
    readonly iconSize = input<'small' | 'medium'>('medium');
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);

    constructor(private store: Store) {}
}
