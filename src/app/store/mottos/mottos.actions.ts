import { Language } from '../../models';

export class GetMottos {
    static readonly type = '[Mottos] Get mottos';
    constructor(public language: Language) {}
}
