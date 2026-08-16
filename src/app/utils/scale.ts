const ROUND_FRACTIONS = [5, 2, 1];

export function getRoundDistanceKm(maxKm: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(maxKm));
    const fraction = maxKm / magnitude;
    const roundFraction = ROUND_FRACTIONS.find(value => fraction >= value) ?? ROUND_FRACTIONS[ROUND_FRACTIONS.length - 1];
    return roundFraction * magnitude;
}
