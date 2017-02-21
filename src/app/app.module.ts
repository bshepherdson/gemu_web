import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { CodemirrorModule } from 'ng2-codemirror';

import { AppComponent }  from './app.component';
import { EditorComponent }  from './editor/editor.component';
import { SourceService }  from './editor/source.service';

@NgModule({
  imports:      [
    BrowserModule,
    CodemirrorModule,
    FormsModule,
  ],
  declarations: [
    AppComponent,
    EditorComponent,
  ],
  providers: [
    SourceService,
    { provide: Window, useValue: window },
  ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
