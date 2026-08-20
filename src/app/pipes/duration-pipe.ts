import { Pipe, PipeTransform } from '@angular/core';
import { Store } from '@ngxs/store';
import { LanguagesState } from '../store';
import { RouteResult } from '../models';

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

@Pipe({
    name: 'duration',
})
export class DurationPipe implements PipeTransform {
    constructor(private store: Store) {}

    transform(routeResult: RouteResult, placeholder = '-'): string {
        if (!routeResult) {
            return placeholder;
        }

        const ui = this.store.selectSnapshot(LanguagesState.coreUi);
        let remainingMinutes = Math.round(routeResult.timeHours * 60);

        const weeks = Math.floor(remainingMinutes / MINUTES_PER_WEEK);
        remainingMinutes -= weeks * MINUTES_PER_WEEK;
        const days = Math.floor(remainingMinutes / MINUTES_PER_DAY);
        remainingMinutes -= days * MINUTES_PER_DAY;
        const wholeHours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;

        const units = [
            { value: weeks, unit: ui.weeks, minutesPerUnit: MINUTES_PER_WEEK },
            { value: days, unit: ui.days, minutesPerUnit: MINUTES_PER_DAY },
            { value: wholeHours, unit: ui.hours, minutesPerUnit: 60 },
            { value: minutes, unit: ui.minutes, minutesPerUnit: 1 },
        ];

        const primaryIndex = units.findIndex(({ value }) => value > 0);
        if (primaryIndex === -1) {
            return `0 ${ui.minutes}`;
        }

        const primary = units[primaryIndex];
        const secondary = units[primaryIndex + 1];
        if (!secondary) {
            return `${primary.value} ${primary.unit}`;
        }

        const remainderBelowSecondary = units
            .slice(primaryIndex + 2)
            .reduce((total, { value, minutesPerUnit }) => total + value * minutesPerUnit, 0);
        const roundedSecondary = Math.round(
            secondary.value + remainderBelowSecondary / secondary.minutesPerUnit,
        );
        if (roundedSecondary === 0) {
            return `${primary.value} ${primary.unit}`;
        }

        return `${primary.value} ${primary.unit} ${roundedSecondary} ${secondary.unit}`;
    }
}
