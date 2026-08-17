import {
    ChangeDetectionStrategy,
    Component,
    computed,
    OnInit,
    SecurityContext,
} from '@angular/core';
import { MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Converter } from 'showdown';
import { Store } from '@ngxs/store';
import { GetAboutText, LanguagesState, UserSettingsState } from '../../store';
import { DomSanitizer } from '@angular/platform-browser';
import { SpinnerComponent } from '../spinner/spinner.component';

@Component({
    selector: 'coiaf-about-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatDialogTitle,
        MatIcon,
        MatIconButton,
        MatDialogClose,
        MatDialogContent,
        SpinnerComponent,
    ],
    templateUrl: './about-dialog.component.html',
    styleUrl: './about-dialog.component.scss',
})
export class AboutDialogComponent implements OnInit {
    readonly coreUi = this.store.selectSignal(LanguagesState.coreUi);
    readonly about = this.store.selectSignal(LanguagesState.about);

    readonly aboutHtml = computed<string>(() => {
        const about = this.about();
        return this.mdToHtml(about);
    });

    private converter = new Converter({
        simplifiedAutoLink: true,
        openLinksInNewWindow: true,
        literalMidWordUnderscores: true,
    });

    constructor(
        private store: Store,
        private sanitizer: DomSanitizer,
    ) {}

    ngOnInit() {
        const language = this.store.selectSnapshot(UserSettingsState.language);
        this.store.dispatch(new GetAboutText(language));
    }

    private mdToHtml(md: string): string {
        const html = this.converter.makeHtml(md);
        return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    }
}
