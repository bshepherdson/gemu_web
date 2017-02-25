import { Component } from '@angular/core';

@Component({
  selector: 'gemu-app',
  template: `
    <md-toolbar>
      <span>GEMU Web IDE</span>

      <nav md-tab-nav-bar>
        <a md-tab-link
            *ngFor="let link of navLinks"
            [routerLink]="link.route"
            routerLinkActive #rla="routerLinkActive"
            [active]="rla.isActive">
          {{link.label}}
        </a>
      </nav>
    </md-toolbar>

    <router-outlet></router-outlet>
  `,
})
export class AppComponent  {
  navLinks = [
    { route: '/edit', label: 'Editor' },
  ];
}
