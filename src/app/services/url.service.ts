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
        this.location.go(path ? `/${encodeURIComponent(path)}` : '/', this.query);
    }

    get query(): string {
        const [_, query] = this.urlParts;
        return query ? decodeURIComponent(query) : '';
    }

    set query(query: string) {
        this.location.go(this.path, query ? encodeURIComponent(query) : '');
    }

    private get urlParts(): string[] {
        return this.location.path().split('?');
    }

    constructor(private location: Location) {}
}
