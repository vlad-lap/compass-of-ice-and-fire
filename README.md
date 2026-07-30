# Compass of Ice and Fire

## Disclaimer

Compass of Ice and Fire is an unofficial, non-commercial fan project. It is not affiliated with or endorsed by George R. R. Martin, HBO, or any other rights holders.

## Map Data Sources

The geographic data included in this project has been independently created for Compass of Ice and Fire.

The map has been manually recreated in QGIS using *The Lands of Ice and Fire* by George R. R. Martin and Jonathan Roberts as the primary cartographic reference. Additional published reference materials were consulted to verify the geography and locations.

No third-party GeoJSON datasets are included or redistributed as part of this project.

## Data Processing

Original GeoJSON files are modified only to fix obvious factual issues such as spelling mistakes. All structural transformations are performed by preprocessing scripts.

## Tech Stack

- **Angular 21** — standalone components, signals, lazy-loaded routes
- **MapLibre GL** (`maplibre-gl` + `@maplibre/ngx-maplibre-gl`) — WebGL map renderer
- **NGXS** — GeoJSON data store
- **Angular Material** — UI components

## Development

```bash
npm start        # build geodata + serve
npm run build    # build geodata + production build
```

Geodata is preprocessed from `qgis/` into `geodata/` by `scripts/build-geodata.mjs` before every serve/build.

## License

Copyright © 2026 vlad-lap

The source code is licensed under the Mozilla Public License 2.0.
