import { LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon } from 'geojson';
import { buildMaskPolygon, getGeometryPositions } from './geometry';

describe('getGeometryPositions', () => {
    it('returns the single position for a Point', () => {
        const geometry: Point = { type: 'Point', coordinates: [1, 2] };
        expect(getGeometryPositions(geometry)).toEqual([[1, 2]]);
    });

    it('returns coordinates as-is for a MultiPoint', () => {
        const geometry: MultiPoint = { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] };
        expect(getGeometryPositions(geometry)).toEqual([[1, 2], [3, 4]]);
    });

    it('returns coordinates as-is for a LineString', () => {
        const geometry: LineString = { type: 'LineString', coordinates: [[1, 2], [3, 4]] };
        expect(getGeometryPositions(geometry)).toEqual([[1, 2], [3, 4]]);
    });

    it('flattens rings for a Polygon', () => {
        const geometry: Polygon = {
            type: 'Polygon',
            coordinates: [
                [[0, 0], [0, 1], [1, 1], [0, 0]],
                [[0.2, 0.2], [0.2, 0.3], [0.3, 0.3], [0.2, 0.2]],
            ],
        };
        expect(getGeometryPositions(geometry)).toEqual([
            [0, 0], [0, 1], [1, 1], [0, 0],
            [0.2, 0.2], [0.2, 0.3], [0.3, 0.3], [0.2, 0.2],
        ]);
    });

    it('flattens lines for a MultiLineString', () => {
        const geometry: MultiLineString = {
            type: 'MultiLineString',
            coordinates: [
                [[0, 0], [1, 1]],
                [[2, 2], [3, 3]],
            ],
        };
        expect(getGeometryPositions(geometry)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    });

    it('flattens polygons and rings for a MultiPolygon', () => {
        const geometry: MultiPolygon = {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [0, 1], [1, 1], [0, 0]]],
                [[[5, 5], [5, 6], [6, 6], [5, 5]]],
            ],
        };
        expect(getGeometryPositions(geometry)).toEqual([
            [0, 0], [0, 1], [1, 1], [0, 0],
            [5, 5], [5, 6], [6, 6], [5, 5],
        ]);
    });
});

describe('buildMaskPolygon', () => {
    const bounds: [[number, number], [number, number]] = [[-10, -10], [10, 10]];

    it('wraps a hole fully inside bounds with a reversed ring', () => {
        const hole: Polygon = {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
        };

        const mask = buildMaskPolygon(hole, bounds);

        expect(mask.type).toBe('Polygon');
        expect(mask.coordinates[0]).toEqual([
            [-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10],
        ]);
        expect(mask.coordinates[1]).toEqual([...hole.coordinates[0]].reverse());
    });

    it('clips a hole that extends past the bounds', () => {
        const hole: Polygon = {
            type: 'Polygon',
            coordinates: [[[-15, 0], [-15, 5], [5, 5], [5, 0], [-15, 0]]],
        };

        const mask = buildMaskPolygon(hole, bounds);

        expect(mask.coordinates[1].every(([lon]) => lon >= -10)).toBe(true);
    });

    it('wraps each ring of a MultiPolygon hole', () => {
        const hole: MultiPolygon = {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
                [[[-5, -5], [-5, -3], [-3, -3], [-3, -5], [-5, -5]]],
            ],
        };

        const mask = buildMaskPolygon(hole, bounds);

        expect(mask.coordinates).toHaveLength(3);
    });
});
