import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'coiaf-skeleton-loader',
    imports: [],
    template: '<ng-content />',
    styleUrl: './skeleton-loader.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.loading]': 'loading()',
        '[class.rounded]': 'rounded()',
        '[style.width.px]': 'width()',
        '[style.height.px]': 'height()',
    },
})
export class SkeletonLoaderComponent {
    readonly loading = input.required<boolean>();
    readonly rounded = input<boolean>(false);
    readonly width = input<number>();
    readonly height = input<number>();
}
