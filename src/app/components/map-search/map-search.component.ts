import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    effect,
    ElementRef,
    OnInit,
    output,
    viewChild,
} from '@angular/core';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import {
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatOptgroup,
    MatOption,
} from '@angular/material/autocomplete';
import { Store } from '@ngxs/store';
import {
    GeodataState,
    HISTORY_STATE_TOKEN,
    LanguagesState,
    SetLanguage,
    UserSettingsState,
} from '../../store';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, filter, fromEvent, map, Observable, startWith } from 'rxjs';
import { FeatureData, OptionGroup } from '../../models';
import { flatten, isEmpty, mapValues, omitBy } from 'lodash';
import { CommonModule, KeyValue } from '@angular/common';
import { MatIconButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LocalizePipe, SortSearchOptionsPipe } from '../../pipes';
import { matchesSearch } from '../../utils';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AVAILABLE_LANGUAGES, RECENT } from '../../constants';
import { SearchService } from '../../services';

const OPTIONS_GROUP_ORDER: OptionGroup[] = [
    RECENT,

    'city',
    'castle',
    'ruin',
    'settlement',
    'other',

    'theWall',
    'theFiveForts',
    'kingdoms',
    'countries',
    'regions',
    'roads',

    'continents',
    'islands',
    'seas',
    'rivers',
    'lakes',
    'mountains',
    'steppes',
    'forests',
    'shores',
    'vales',
    'swamps',
    'deserts',
    'wastelands',
];

const AUTOCOMPLETE_BLUR_DEBOUNCE_TIME_MS = 100;

@Component({
    selector: 'coiaf-map-search',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInput,
        MatIcon,
        MatAutocomplete,
        MatAutocompleteTrigger,
        MatOptgroup,
        MatOption,
        MatIconButton,
        LocalizePipe,
        SortSearchOptionsPipe,
    ],
    templateUrl: './map-search.component.html',
    styleUrl: './map-search.component.scss',
})
export class MapSearchComponent implements OnInit {
    readonly applySearch = output<FeatureData>();
    readonly resetSearch = output<void>();

    readonly searchInput = viewChild('searchInput', { read: ElementRef });
    readonly autocomplete = viewChild(MatAutocomplete);
    readonly autocompleteTrigger = viewChild(MatAutocompleteTrigger);

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly optionGroups = this.store.selectSignal(LanguagesState.optionGroups);
    readonly language = this.store.selectSignal(UserSettingsState.language);
    readonly options = this.store.selectSnapshot(GeodataState.searchOptions);
    readonly searchControl = new FormControl<FeatureData | string>('');

    readonly displayFn = this.searchService.displayFn;

    readonly filteredOptions$: Observable<Record<string, FeatureData[]>> =
        this.searchControl.valueChanges.pipe(
            startWith(this.searchControl.value),
            map(query => {
                const recent = this.store.selectSnapshot(HISTORY_STATE_TOKEN);
                const allOptions = { recent, ...this.options };
                return mapValues(allOptions, (features, group) =>
                    features.filter(
                        feature => this.matchesSearch(feature) && (group === RECENT || !!query),
                    ),
                );
            }),
            map(options => omitBy(options, isEmpty)),
        );

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
                if (this.isFeatureData(value)) {
                    this.search(value);
                } else if (!value) {
                    this.reset();
                }
            });

        fromEvent(this.searchInput().nativeElement, 'blur')
            .pipe(
                debounceTime(AUTOCOMPLETE_BLUR_DEBOUNCE_TIME_MS),
                filter(() => !this.searchService.selectedId()),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.autocompleteTrigger().closePanel());
    }

    setSelectedId(id: string): void {
        const options = flatten(Object.values(this.options));
        const selectedOption = options.find(option => option.id === id);
        this.searchControl.patchValue(selectedOption);
    }

    sortOptionsGroup(
        { key: key1 }: KeyValue<OptionGroup, FeatureData[]>,
        { key: key2 }: KeyValue<OptionGroup, FeatureData[]>,
    ): number {
        return OPTIONS_GROUP_ORDER.indexOf(key1) - OPTIONS_GROUP_ORDER.indexOf(key2);
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

    private matchesSearch({ searchKeys }: FeatureData): boolean {
        const searchValue = this.searchControl.value;
        const query = this.isFeatureData(searchValue) ? searchValue.name : searchValue;
        return matchesSearch(searchKeys, query ?? '');
    }

    private isFeatureData(value: FeatureData | string): value is FeatureData {
        return typeof value === 'object' && 'id' in value;
    }
}
