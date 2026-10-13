import { Injectable } from '@angular/core';
import { Location } from '@angular/common';

export interface UrlParts {
    path: string;
    query: Record<string, string>;
}

@Injectable({
    providedIn: 'root',
})
export class UrlService {
    get path(): string {
        const [path] = this.urlParts;
        return path ? decodeURIComponent(path.replace(/^\//, '')) : '';
    }

    set path(path: string) {
        this.navigate(path, this.query);
    }

    get query(): Record<string, string> {
        const [_, query] = this.urlParts;
        return query ? this.parseQuery(query) : null;
    }

    set query(query: Record<string, string>) {
        this.navigate(this.path, query);
    }

    private get urlParts(): string[] {
        return this.location.path().split('?');
    }

    constructor(private location: Location) {}

    navigate(path: string, query: Record<string, string>): void {
        const url = path ? `/${encodeURIComponent(path)}` : '/';
        const serializedQuery = this.serializeQuery(query);

        if (!this.location.isCurrentPathEqualTo(url, serializedQuery)) {
            this.location.go(url, serializedQuery);
        }
    }

    onHistoryNavigation(callback: (url: UrlParts) => void): void {
        this.location.subscribe(() => callback({ path: this.path, query: this.query }));
    }

    private parseQuery(query: string): Record<string, string> {
        if (!query) {
            return null;
        }

        return decodeURIComponent(query)
            .split('&')
            .reduce((params, keyValue) => {
                const [key, value] = keyValue.split('=');
                return { ...params, [key]: value };
            }, {});
    }

    private serializeQuery(params: Record<string, string>): string {
        if (!params) {
            return '';
        }

        return Object.entries(params)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
    }
}
