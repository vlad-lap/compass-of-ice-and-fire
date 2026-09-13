import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NgClass } from '@angular/common';

@Component({
    selector: 'coiaf-spinner',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIcon, NgClass],
    template: '<mat-icon svgIcon="spinner" [ngClass]="size()" />',
    styleUrl: './spinner.component.scss',
})
export class SpinnerComponent {
    size = input<'small' | 'medium'>('medium');

    protected readonly iconScale = {
        small: 0.05,
        medium: 0.1,
    };
}
