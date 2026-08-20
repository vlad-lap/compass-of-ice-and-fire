import { Position } from 'geojson';
import { CellIndex, Grid } from '../models';

export const BBOX_MARGIN_RATIO = 0.25;
export const MIN_BBOX_MARGIN = 0.25;
export const DEFAULT_CELL_BUDGET = 180_000;

// Floor on cell size (~1.7 km), so that search time depends on how far apart the points are rather
// than jumping for short routes: spending the whole cell budget on a 70 km hop resolved terrain down
// to 220 m per cell, which no map feature justifies. The upper end stays budget-driven, so the cell
// count of a continent-spanning grid remains bounded.
export const MIN_CELL_SIZE = 0.02;

export const NEIGHBOR_OFFSETS: CellIndex[] = [
    { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
    { col: -1, row: 0 }, { col: 1, row: 0 },
    { col: -1, row: 1 }, { col: 0, row: 1 }, { col: 1, row: 1 },
];

export function buildGrid(
    from: Position,
    to: Position,
    cellBudget = DEFAULT_CELL_BUDGET,
    marginRatio = BBOX_MARGIN_RATIO,
    minMargin = MIN_BBOX_MARGIN,
): Grid {
    const minLngRaw = Math.min(from[0], to[0]);
    const maxLngRaw = Math.max(from[0], to[0]);
    const minLatRaw = Math.min(from[1], to[1]);
    const maxLatRaw = Math.max(from[1], to[1]);

    // The floor matters as much as the ratio: two points on the same meridian have zero span, so a
    // purely proportional margin would keep the box a sliver however wide the retry step asks for,
    // and a detour to a crossing a hundred km aside could never be found.
    const marginLng = Math.max((maxLngRaw - minLngRaw) * marginRatio, minMargin);
    const marginLat = Math.max((maxLatRaw - minLatRaw) * marginRatio, minMargin);

    const minLng = minLngRaw - marginLng;
    const minLat = minLatRaw - marginLat;
    const width = maxLngRaw + marginLng - minLng;
    const height = maxLatRaw + marginLat - minLat;

    const cellSize = Math.max(MIN_CELL_SIZE, Math.sqrt((width * height) / cellBudget));
    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));

    return { minLng, minLat, cellSize, cols, rows };
}

export function cellCount(grid: Grid): number {
    return grid.cols * grid.rows;
}

export function toFlatIndex(grid: Grid, col: number, row: number): number {
    return row * grid.cols + col;
}

export function getCellCenter(grid: Grid, col: number, row: number): Position {
    return [
        grid.minLng + (col + 0.5) * grid.cellSize,
        grid.minLat + (row + 0.5) * grid.cellSize,
    ];
}

export function getCellIndexAt(grid: Grid, point: Position): CellIndex | null {
    const col = Math.floor((point[0] - grid.minLng) / grid.cellSize);
    const row = Math.floor((point[1] - grid.minLat) / grid.cellSize);

    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
        return null;
    }

    return { col, row };
}

export function getColAtLng(grid: Grid, lng: number): number {
    return Math.floor((lng - grid.minLng) / grid.cellSize);
}

export function getRowAtLat(grid: Grid, lat: number): number {
    return Math.floor((lat - grid.minLat) / grid.cellSize);
}
