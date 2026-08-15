import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StarIconComponent } from '../star-icon/star-icon.component';

@Component({
    selector: 'coiaf-spinner',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StarIconComponent],
    template: '<coiaf-star-icon [scale]="iconScale[size()]" [animated]="true" />',
})
export class SpinnerComponent {
    size = input<'small' | 'medium'>('medium');

    protected readonly iconScale = {
        small: 0.05,
        medium: 0.1,
    };
}
