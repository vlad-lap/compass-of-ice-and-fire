import { FeatureData } from '../../models';

export class AddHistoryItem {
    static readonly type = '[History] Add item';
    constructor(public item: FeatureData) {}
}