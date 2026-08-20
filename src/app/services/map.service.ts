import { ComponentRef, Injectable, signal, ViewContainerRef } from '@angular/core';
import { LngLatLike, MapLayerMouseEvent, MapMouseEvent, MapTouchEvent, Popup } from 'maplibre-gl';
import { TooltipComponent, TooltipOptions } from '../components/tooltip/tooltip.component';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { Feature } from 'geojson';
import { FeatureData } from '../models';
import { FeatureCardComponent } from '../components/feature-card/feature-card.component';
import { ComponentType } from '@angular/cdk/portal';
import { SearchService } from './search.service';
import { RouteCardComponent } from '../components/route-card/route-card.component';
import { RouteService } from './route.service';

@Injectable({
    providedIn: 'root',
})
export class MapService {
    viewContainerRef: ViewContainerRef;

    readonly routeCardOpened = signal<boolean>(false);

    private popup: Popup;
    private tooltipRef: ComponentRef<TooltipComponent>;
    private bottomSheetRef: MatBottomSheetRef;

    constructor(
        private bottomSheet: MatBottomSheet,
        private searchService: SearchService,
        private routeService: RouteService,
    ) {

    }

    showTooltip(
        { target: map, lngLat }: MapLayerMouseEvent | MapMouseEvent | MapTouchEvent,
        { geometry, properties }: Feature,
        options?: TooltipOptions,
    ): void {
        const anchor = geometry.type === 'Point' ? (geometry.coordinates as LngLatLike) : lngLat;

        this.hideTooltip();
        this.popup = new Popup({
            closeButton: false,
            closeOnClick: false,
            focusAfterOpen: false,
            className: 'coiaf-map-popup',
        })
            .setLngLat(anchor)
            .setDOMContent(this.buildTooltip(properties as FeatureData, options))
            .addTo(map);
    }

    hideTooltip(): void {
        this.popup?.remove();
        this.popup = null;
        this.tooltipRef?.destroy();
        this.tooltipRef = null;
    }

    openFeatureCard(feature: Feature): void {
        this.hideTooltip();

        this.openCard(
            FeatureCardComponent,
            {
                ...(feature.properties as FeatureData),
                maxHeight: 300,
            },
            () => this.searchService.selectedId.set(null),
        );
    }

    openRouteCard(): void {
        this.routeCardOpened.set(true);
        this.openCard(
            RouteCardComponent,
            { height: 225 },
            () => {
                this.routeService.routeEnabled.set(false);
                this.routeCardOpened.set(false);
            },
        );
    }

    closeCard(): void {
        this.bottomSheet.dismiss();
    }

    private buildTooltip(location: FeatureData, options: TooltipOptions): HTMLElement {
        this.tooltipRef = this.viewContainerRef.createComponent(TooltipComponent);
        this.tooltipRef.setInput('location', location);
        this.tooltipRef.setInput('options', options);
        this.tooltipRef.instance.close$.subscribe(() => this.hideTooltip());
        this.tooltipRef.changeDetectorRef.detectChanges();
        return this.tooltipRef.location.nativeElement;
    }

    private openCard<T, D>(
        component: ComponentType<T>,
        data?: D,
        onClose?: () => void,
    ): void {
        const bottomSheetRef = (this.bottomSheetRef = this.bottomSheet.open(component, {
            hasBackdrop: false,
            panelClass: 'coiaf-card-panel',
            data,
        }));

        bottomSheetRef.afterDismissed().subscribe(() => {
            if (this.bottomSheetRef === bottomSheetRef) {
                onClose();
            }
        });
    }
}
