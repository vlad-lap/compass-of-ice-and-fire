import { GeodataType } from '../../models';

export class GetGeodata {
    static readonly type = '[Map] Get geodata';
    constructor(public key: GeodataType) {}
}

export class GetRoadNetwork {
    static readonly type = '[Map] Get road network';
}

export class GetBarrierCrossings {
    static readonly type = '[Map] Get barrier crossings';
}
