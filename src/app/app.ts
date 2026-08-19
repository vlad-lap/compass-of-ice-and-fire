import { Component, DestroyRef, OnInit, signal } from '@angular/core';
import {
    ActivationStart,
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    Router,
    RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SpinnerComponent } from './components/spinner/spinner.component';
import { MatIconRegistry } from '@angular/material/icon';
import { SVG_ICONS } from './svg-icons';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
    selector: 'coiaf-app-root',
    imports: [RouterOutlet, SpinnerComponent],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App implements OnInit {
    readonly loading = signal<boolean>(false);

    constructor(
        private router: Router,
        private destroyRef: DestroyRef,
        private iconRegistry: MatIconRegistry,
        private sanitizer: DomSanitizer,
    ) {}

    ngOnInit(): void {
        this.enableNavigationalLoader();
        this.registerSvgIcons();
    }

    private enableNavigationalLoader(): void {
        this.router.events
            .pipe(
                filter(event => event instanceof ActivationStart),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.loading.set(true));

        this.router.events
            .pipe(
                filter(event =>
                    [NavigationEnd, NavigationCancel, NavigationError].some(
                        Class => event instanceof Class,
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.loading.set(false));
    }

    private registerSvgIcons(): void {
        Object.entries(SVG_ICONS).forEach(([name, svg]) => {
            this.iconRegistry.addSvgIconLiteral(name, this.sanitizer.bypassSecurityTrustHtml(svg));
        });
    }
}
