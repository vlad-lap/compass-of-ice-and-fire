import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
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
import { GeodataState, LanguagesState, SetLanguage } from '../../store';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map, Observable, startWith } from 'rxjs';
import { FeatureData, GeodataType, LocationType } from '../../models';
import { flatten, isEmpty, mapValues, omitBy } from 'lodash';
import { CommonModule, KeyValue, Location } from '@angular/common';
import { MatIconButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LocalizePipe, SortByPipe } from '../../pipes';
import { matchesSearch } from '../../utils';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { APP_TITLE, AVAILABLE_LANGUAGES } from '../../constants';

type OptionGroup = GeodataType | LocationType;

const OPTIONS_GROUP_ORDER: OptionGroup[] = [
    'castles',
    'cities',
    'towns',
    'settlements',
    'ruins',
    'other',

    'kingdoms',
    'lands',
    'wall',
    'roads',

    'continents',
    'islands',
    'seas',
    'rivers',
    'lakes',
    'mountains',
    'forests',
    'shores',
    'swamps',
    'deserts',
];

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
        SortByPipe,
        LocalizePipe,
    ],
    templateUrl: './map-search.component.html',
    styleUrl: './map-search.component.scss',
})
export class MapSearchComponent implements OnInit {
    readonly applySearch = output<FeatureData>();
    readonly resetSearch = output<void>();

    readonly searchInput = viewChild('searchInput', { read: ElementRef });

    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly optionGroups = this.store.selectSignal(LanguagesState.optionGroups);
    readonly language = this.store.selectSignal(LanguagesState.language);
    readonly options = this.store.selectSnapshot(GeodataState.searchOptions);
    readonly searchControl = new FormControl<FeatureData | string>('');

    readonly filteredOptions$: Observable<Record<string, FeatureData[]>> =
        this.searchControl.valueChanges.pipe(
            startWith(this.searchControl.value),
            map(() =>
                mapValues(this.options, features =>
                    features.filter(feature => this.matchesSearch(feature)),
                ),
            ),
            map(options => omitBy(options, isEmpty)),
        );

    private readonly hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    constructor(
        private store: Store,
        private location: Location,
        private destroyRef: DestroyRef,
        private title: Title,
    ) {}

    ngOnInit(): void {
        const id = this.location.path().replace(/^\//, '');
        if (id) {
            this.setSelectedId(decodeURIComponent(id));
        }

        this.searchControl.valueChanges
            .pipe(startWith(this.searchControl.value), takeUntilDestroyed(this.destroyRef))
            .subscribe(value => {
                if (this.isFeatureData(value)) {
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

    displayFn = (option: FeatureData): string => {
        const language = this.language();
        return option?.[`name_${language}`] ?? option?.name;
    };

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
        this.setTitle(value);
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
        this.setUrl(value);
        this.setTitle(value);
    }

    private reset(): void {
        this.resetSearch.emit();
        this.setUrl(null);
        this.setTitle(null);
    }

    private setUrl(value: FeatureData): void {
        this.location.go(value ? `/${encodeURIComponent(value.id)}` : '/');
    }

    private setTitle(value: FeatureData): void {
        const title = value ? `${this.displayFn(value)} | ${APP_TITLE}` : APP_TITLE;
        this.title.setTitle(title);
    }

    private matchesSearch({ searchKeys }: FeatureData): boolean {
        const searchValue = this.searchControl.value;
        const query = this.isFeatureData(searchValue) ? searchValue.name : searchValue;
        return !!query && matchesSearch(searchKeys, query);
    }

    private isFeatureData(value: FeatureData | string): value is FeatureData {
        return typeof value === 'object' && 'id' in value;
    }
}
