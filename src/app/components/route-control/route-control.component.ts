import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    ElementRef,
    OnInit,
    viewChild,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatFormField, MatInput, MatPrefix } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LanguagesState, UserSettingsState } from '../../store';
import { Store } from '@ngxs/store';
import { AutocompleteComponent } from '../autocomplete/autocomplete.component';
import { OptionGroup, RouteEndpoints, RoutePointValue } from '../../models';
import { Observable, startWith } from 'rxjs';
import { RECENT } from '../../constants';
import { MapService, RouteService } from '../../services';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { pickBy } from 'lodash';
import { isFeatureData } from '../../utils';
import { AutocompleteTriggerDirective } from '../../directives';
import { MatIconButton } from '@angular/material/button';

interface RouteForm {
    from: FormControl<RoutePointValue>;
    to: FormControl<RoutePointValue>;
}

@Component({
    selector: 'coiaf-route-control',
    imports: [
        AsyncPipe,
        MatFormField,
        MatIcon,
        MatInput,
        MatPrefix,
        ReactiveFormsModule,
        AutocompleteComponent,
        AutocompleteTriggerDirective,
        MatIconButton,
    ],
    templateUrl: './route-control.component.html',
    styleUrls: ['../../form-field.scss', './route-control.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteControlComponent implements OnInit {
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly language = this.store.selectSignal(UserSettingsState.language);

    readonly fromInput = viewChild('fromInput', { read: ElementRef });
    readonly toInput = viewChild('toInput', { read: ElementRef });

    readonly form: FormGroup<RouteForm> = this.fb.group({
        from: new FormControl<RoutePointValue>(''),
        to: new FormControl<RoutePointValue>(''),
    });

    protected readonly formValue$: Observable<RouteEndpoints> = this.form.valueChanges.pipe(
        startWith(this.form.value),
    );

    protected readonly availableGroups: OptionGroup[] = [
        RECENT,
        'city',
        'castle',
        'ruin',
        'settlement',
        'other',
        'theFiveForts',
    ];

    protected readonly shouldClose = computed<{ from: boolean; to: boolean }>(() => {
        const endpoints = this.routeService.endpoints();
        return {
            from: !isFeatureData(endpoints?.from),
            to: !isFeatureData(endpoints?.to),
        };
    });

    protected readonly selectedIds = computed<{ from: string[]; to: string[] }>(() => {
        const endpoints = this.routeService.endpoints();
        return {
            from: isFeatureData(endpoints?.from) ? [endpoints.from.id] : [],
            to: isFeatureData(endpoints?.to) ? [endpoints.to.id] : [],
        };
    });

    protected readonly endpointPositions = this.routeService.endpointPositions;

    constructor(
        private store: Store,
        private fb: FormBuilder,
        private destroyRef: DestroyRef,
        private mapService: MapService,
        private routeService: RouteService,
    ) {
        effect(() => {
            const routeEnabled = this.routeService.routeEnabled();
            const cardOpened = this.mapService.routeCardOpened();

            if (routeEnabled && !cardOpened) {
                this.mapService.openRouteCard();
            }
        });

        effect(() => {
            const routeEndpoints = this.routeService.endpoints();

            if (!routeEndpoints) {
                this.form.reset({ from: '', to: '' }, { emitEvent: false });
                this.fromInput().nativeElement.blur();
                this.toInput().nativeElement.blur();
                return;
            }

            const validEndpoints = pickBy(
                routeEndpoints,
                value => !value || isFeatureData(value) || Array.isArray(value),
            );

            this.form.patchValue(validEndpoints, { emitEvent: false });
        });
    }

    ngOnInit(): void {
        this.form.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(value => this.routeService.endpoints.set(value));
    }

    swap(): void {
        const { from, to } = this.routeService.endpoints();
        this.routeService.endpoints.set({
            from: to,
            to: from,
        });
    }
}
