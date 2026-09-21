import { ComponentRef, Injectable, signal, ViewContainerRef } from '@angular/core';
import { LngLatLike, Map, MapLayerMouseEvent, MapMouseEvent, MapTouchEvent, Popup } from 'maplibre-gl';
import { TooltipComponent, TooltipOptions } from '../components/map/tooltip/tooltip.component';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { Feature } from 'geojson';
import { FeatureData, RoutePlan, TravelMode } from '../models';
import { FeatureCardComponent, RouteCardComponent } from '../components/cards';
import { ComponentType } from '@angular/cdk/portal';
import { RouteService } from './route.service';
import { RouteTooltipComponent } from '../components/map/route-tooltip/route-tooltip.component';

@Injectable({
    providedIn: 'root',
})
export class MapService {
    viewContainerRef: ViewContainerRef;

    readonly routeCardOpened = signal<boolean>(false);

    private popup: Popup;
    private tooltipRef: ComponentRef<TooltipComponent>;

    private routePopup: Popup;
    private routeTooltipRef: ComponentRef<RouteTooltipComponent>;

    private bottomSheetRef: MatBottomSheetRef;

    constructor(
        private bottomSheet: MatBottomSheet,
        private routeService: RouteService,
    ) {}

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

    showRouteTooltip(map: Map, anchor: LngLatLike, plan: RoutePlan, mode: TravelMode): void {
        this.hideRouteTooltip();

        if (!map) {
            return;
        }

        this.routePopup = new Popup({
            closeButton: false,
            closeOnClick: false,
            focusAfterOpen: false,
            className: 'coiaf-route-popup',
        })
            .setLngLat(anchor)
            .setDOMContent(this.buildRouteTooltip(plan, mode))
            .addTo(map);
    }

    hideRouteTooltip(): void {
        this.routePopup?.remove();
        this.routePopup = null;
        this.routeTooltipRef?.destroy();
        this.routeTooltipRef = null;
    }

    openFeatureCard(feature: Feature): void {
        this.hideTooltip();

        this.openCard(FeatureCardComponent, {
            ...(feature.properties as FeatureData),
            maxHeight: 320,
        });
    }

    openRouteCard(): void {
        this.routeCardOpened.set(true);
        this.openCard(RouteCardComponent, { height: 176 }, () => {
            this.routeService.routeEnabled.set(false);
            this.routeCardOpened.set(false);
        });
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

    private buildRouteTooltip(plan: RoutePlan, mode: TravelMode): HTMLElement {
        this.routeTooltipRef = this.viewContainerRef.createComponent(RouteTooltipComponent);
        this.routeTooltipRef.setInput('plan', plan);
        this.routeTooltipRef.setInput('mode', mode);
        this.routeTooltipRef.changeDetectorRef.detectChanges();
        return this.routeTooltipRef.location.nativeElement;
    }

    private openCard<T, D>(component: ComponentType<T>, data?: D, onClose?: () => void): void {
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
