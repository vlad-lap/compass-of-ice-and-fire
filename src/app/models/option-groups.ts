import { GeodataType } from './geodata';
import { LocationType } from './location';
import { RECENT } from '../constants';

export type OptionGroup = GeodataType | LocationType | typeof RECENT;
export type OptionGroupsDict<T> = Partial<Record<OptionGroup, T>>;