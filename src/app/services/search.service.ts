import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class SearchService {
    selectedId = signal<string>(null);
}
