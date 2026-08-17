import { Language } from '../../models';
import { CenterZoomBearing } from 'maplibre-gl';

export class SetLanguage {
    static readonly type = '[User settings] Set language';
    constructor(public language: Language) {}
}

export class SetPosition {
    static readonly type = '[User settings] Set position';
    constructor(public position: CenterZoomBearing) {}
}