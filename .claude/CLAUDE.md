
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use constructor injection instead of `inject()` function inside classes
- Use the `inject()` function instead of constructor injection inside functions

## Geodata Build Pipeline

- Raw source data lives in `qgis/`, processed output goes to `geodata/`
- `scripts/build-geodata.mjs` runs before every serve/build (`npm start` / `npm run build`)
- To regenerate manually: `npm run build-geodata`
- `got_political_borders.geojson` is derived at build time: kingdom polygon segments where both endpoints are coastline vertices (shared with continents/islands) are dropped, leaving only land-land political borders

## Map Architecture

- There is a single route (`''`) that lazy-loads `MapPageComponent` from `src/app/components/map-page/` — this is the current (and only) map
- All geodata URLs are in `src/app/constants.ts` (`GEODATA_URLS`); sources and layers are declared in the template; paint/layout configs live in `src/app/components/map-page/configs.ts`, map-specific constants (bounds, zoom levels, colors) live in `src/app/components/map-page/constants.ts`
- Search is a separate `MapSearchComponent` (`src/app/components/map-search/`) using a Material autocomplete; it emits `applySearch`/`resetSearch` outputs that `MapPageComponent` handles to highlight and zoom to the selected feature (via a dedicated `search-highlight` GeoJSON source/layers) and show its tooltip

## Routing

- `src/app/utils/{routing,raster,road-network,min-heap}.ts` carry **no comments by design** — the whole explanation lives in `.claude/docs/` (start at `.claude/docs/README.md`, one document per module). Read the matching document before changing any of these four files, and update it in the same change: the reasoning, the measured numbers and the rejected alternatives are not recoverable from the code
- `npm run check-routing` runs `scripts/routing/check-routing.mjs` against real geodata: spec requirements, invariants, and a snapshot baseline in `scripts/routing/baseline.json`. It also runs in CI and fails the build. An intended change of route results means `npm run check-routing -- --update` and committing the new baseline

## Geodata State

- GeoJSON data is loaded by `mapResolver` (attached to the map route) before the route activates; it dispatches `GetGeodata` for each key into `GeodataState`
- Read data in components with `store.selectSignal(GeodataState.geodata('key'))` or `store.selectSignal(GeodataState.labelPoints('key'))` — do not fetch with `HttpClient` directly in map components
- `GeodataState.labelPoints(key)` is a memoized selector that maps polygon/multipolygon features to `Point` features via `getCentralPoint` from `src/app/utils/geometry.ts` — the centroid computation lives in the selector itself, not a component-level `computed()`. Kingdom labels read it directly (`kingdomsLabelPoints`) and render from a separate `kingdoms-label-points` GeoJSON source to prevent duplicate labels across MapLibre internal tiles
- `GeodataState.searchOptions` and `GeodataState.byId(id)` back the search feature: `searchOptions` builds per-type `FeatureData[]` (via `getSearchOptions`/`getLocationsSearchOptions` in `src/app/utils/search.ts`), grouping all location subtypes together and excluding `locations`/`kingdomBorders`; `byId` looks up the full feature across all geodata types for zooming/highlighting. Search matching itself uses `matchesSearch` (prefix match per word) from the same file
