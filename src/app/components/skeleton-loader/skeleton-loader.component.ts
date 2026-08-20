import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'coiaf-skeleton-loader',
    imports: [],
    template: '<ng-content></ng-content>',
    styleUrl: './skeleton-loader.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.loading]': 'loading()',
        '[style.width.px]': 'width()',
    }
})
export class SkeletonLoaderComponent {
    readonly loading = input.required<boolean>();
    readonly width = input<number>();
}
