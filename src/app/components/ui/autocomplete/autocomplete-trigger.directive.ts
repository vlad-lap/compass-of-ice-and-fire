import { AfterViewInit, DestroyRef, Directive, ElementRef, input, Self } from '@angular/core';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { debounceTime, filter, fromEvent } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const AUTOCOMPLETE_BLUR_DEBOUNCE_TIME_MS = 200;

@Directive({
    selector: '[coiafAutocomplete]',
    hostDirectives: [
        {
            directive: MatAutocompleteTrigger,
            inputs: ['matAutocomplete: coiafAutocomplete'],
        },
    ],
})
export class AutocompleteTriggerDirective implements AfterViewInit {
    shouldCloseOnBlur = input<boolean>(true);

    constructor(
        @Self() private autocompleteTrigger: MatAutocompleteTrigger,
        private elementRef: ElementRef,
        private destroyRef: DestroyRef,
    ) {}

    ngAfterViewInit(): void {
        fromEvent(this.elementRef.nativeElement, 'blur')
            .pipe(
                debounceTime(AUTOCOMPLETE_BLUR_DEBOUNCE_TIME_MS),
                filter(() => this.shouldCloseOnBlur()),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.autocompleteTrigger.closePanel());
    }
}
