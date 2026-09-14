import { Routes } from '@angular/router';
import { mapResolver } from './resolvers';

const loadMapPage = () =>
    import('./components/map/map-page.component').then(m => m.MapPageComponent);

export const routes: Routes = [
    {
        path: '',
        resolve: {
            data: mapResolver,
        },
        children: [
            {
                path: '',
                loadComponent: loadMapPage,
            },
            {
                path: ':id',
                loadComponent: loadMapPage,
            },
        ],
    },
];
