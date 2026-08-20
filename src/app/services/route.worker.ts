import { RoadNetwork, RouteWorkerMessage, RoutingIndex } from '../models';
import { buildRoutingIndex } from '../utils/raster';
import { planRoutesWithIndex } from '../utils/routing';

let index: RoutingIndex | null = null;
let roadNetwork: RoadNetwork | null = null;

addEventListener('message', ({ data }: MessageEvent<RouteWorkerMessage>) => {
    if (data.type === 'init') {
        index = buildRoutingIndex(data.geodata);
        roadNetwork = data.roadNetwork;
        return;
    }

    if (!index) {
        return;
    }

    postMessage({
        requestId: data.requestId,
        plan: planRoutesWithIndex(data.from, data.to, index, roadNetwork),
    });
});
