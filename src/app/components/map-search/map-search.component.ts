import {
    ChangeDetectionStrategy,
    Component, computed,
    DestroyRef,
    effect,
    ElementRef,
    OnInit,
    output,
    viewChild,
} from '@angular/core';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { Store } from '@ngxs/store';
import { GeodataState, LanguagesState, SetLanguage, UserSettingsState } from '../../store';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, startWith } from 'rxjs';
import { FeatureData } from '../../models';
import { flatten } from 'lodash';
import { CommonModule } from '@angular/common';
import { MatIconButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AVAILABLE_LANGUAGES } from '../../constants';
import { SearchService } from '../../services';
import { AutocompleteComponent } from '../autocomplete/autocomplete.component';
import { isFeatureData } from '../../utils';
import { AutocompleteTriggerDirective } from '../../directives';

@Component({
    selector: 'coiaf-map-search',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInput,
        MatIcon,
        MatIconButton,
        AutocompleteComponent,
        AutocompleteTriggerDirective,
    ],
    templateUrl: './map-search.component.html',
    styleUrls: ['../../form-field.scss', './map-search.component.scss'],
})
export class MapSearchComponent implements OnInit {
    readonly applySearch = output<FeatureData>();
    readonly resetSearch = output<void>();

    readonly searchInput = viewChild('searchInput', { read: ElementRef });
    readonly autocomplete = viewChild(AutocompleteComponent);

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly language = this.store.selectSignal(UserSettingsState.language);
    readonly options = this.store.selectSnapshot(GeodataState.searchOptions);
    readonly searchControl = new FormControl<FeatureData | string>('');

    readonly searchValue$: Observable<FeatureData | string> = this.searchControl.valueChanges.pipe(
        startWith(this.searchControl.value),
    );

    readonly shouldCloseAutocomplete = computed<boolean>(() => !this.searchService.selectedId());

    private readonly hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    constructor(
        private store: Store,
        private destroyRef: DestroyRef,
        private searchService: SearchService,
    ) {
        effect(() => {
            const selectedId = this.searchService.selectedId();
            this.setSelectedId(selectedId);
        });
    }

    ngOnInit(): void {
        this.searchControl.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(value => {
                if (isFeatureData(value)) {
                    this.search(value);
                } else if (!value) {
                    this.reset();
                }
            });
    }

    setSelectedId(id: string): void {
        const options = flatten(Object.values(this.options));
        const selectedOption = options.find(option => option.id === id);
        this.searchControl.patchValue(selectedOption);
    }

    toggleLanguage(event: MouseEvent): void {
        event.stopPropagation();

        const language = this.language();
        const index = AVAILABLE_LANGUAGES.indexOf(language);
        const nextIndex = index === AVAILABLE_LANGUAGES.length - 1 ? 0 : index + 1;

        this.store.dispatch(new SetLanguage(AVAILABLE_LANGUAGES[nextIndex]));

        const value = this.searchControl.value as FeatureData;
        this.searchControl.reset('', { emitEvent: false });
        this.searchControl.patchValue(value, { emitEvent: false });
        this.searchService.setTitle(value);
    }

    clear(event: MouseEvent): void {
        if (!this.hasHover) {
            event.stopPropagation();
        }
        this.searchControl.reset('');
    }

    private search(value: FeatureData): void {
        queueMicrotask(() => this.searchInput().nativeElement.blur());
        this.applySearch.emit(value);
        this.searchService.selectedId.set(value?.id);
    }

    private reset(): void {
        this.resetSearch.emit();
        this.searchService.selectedId.set(null);
    }
}
