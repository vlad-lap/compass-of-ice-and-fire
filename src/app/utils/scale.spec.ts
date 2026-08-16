import { getRoundDistanceKm } from './scale';

describe('getRoundDistanceKm', () => {
    it('rounds down to 5 within a decade', () => {
        expect(getRoundDistanceKm(87.371)).toBe(50);
    });

    it('rounds down to 2 within a decade', () => {
        expect(getRoundDistanceKm(23)).toBe(20);
    });

    it('rounds down to 1 within a decade', () => {
        expect(getRoundDistanceKm(14)).toBe(10);
    });

    it('handles values below 10', () => {
        expect(getRoundDistanceKm(9.3)).toBe(5);
    });

    it('returns the value unchanged when it is already a round number', () => {
        expect(getRoundDistanceKm(1000)).toBe(1000);
        expect(getRoundDistanceKm(50)).toBe(50);
    });

    it('handles large values', () => {
        expect(getRoundDistanceKm(1234)).toBe(1000);
    });
});
