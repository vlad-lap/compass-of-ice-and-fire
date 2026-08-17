import { Action, State, StateContext, StateToken } from '@ngxs/store';
import { FeatureData } from '../../models';
import { Injectable } from '@angular/core';
import { AddHistoryItem } from './history.actions';
import { buildLocalizedSearchKeys } from '../../utils';
import { insertItem, removeItem } from '@ngxs/store/operators';

const HISTORY_LIMIT = 10;

export const HISTORY_STATE_TOKEN = new StateToken<FeatureData[]>('history');

@State<FeatureData[]>({
    name: HISTORY_STATE_TOKEN,
    defaults: [],
})
@Injectable()
export class HistoryState {
    @Action(AddHistoryItem)
    addItem(
        { getState, setState }: StateContext<FeatureData[]>,
        { item }: AddHistoryItem,
    ): void {
        setState(removeItem(existing => existing.id === item.id));

        const searchKeys = buildLocalizedSearchKeys(item);
        setState(insertItem({ ...item, searchKeys }, 0));

        const history = getState();
        if (history.length > HISTORY_LIMIT) {
            setState(removeItem(history.length - 1));
        }
    }
}