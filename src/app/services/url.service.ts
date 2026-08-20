import { Injectable } from '@angular/core';
import { Location } from '@angular/common';

@Injectable({
    providedIn: 'root',
})
export class UrlService {
    get path(): string {
        const [path] = this.urlParts;
        return path ? decodeURIComponent(path.replace(/^\//, '')) : '';
    }

    set path(path: string) {
        this.location.go(
            path ? `/${encodeURIComponent(path)}` : '/',
            this.serializeQuery(this.query),
        );
    }

    get query(): Record<string, string> {
        const [_, query] = this.urlParts;
        return query ? this.parseQuery(query) : null;
    }

    set query(query: Record<string, string>) {
        this.location.go(this.path, query ? this.serializeQuery(query) : '');
    }

    private get urlParts(): string[] {
        return this.location.path().split('?');
    }

    constructor(private location: Location) {}

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
