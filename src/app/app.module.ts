import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '@angular/material';
import { RouterModule } from '@angular/router';

import { CodemirrorModule } from 'ng2-codemirror';

import { AppComponent }  from './app.component';
import { EditorComponent }  from './editor/editor.component';
import { EditingPageComponent }  from './editing-page.component';
import { NewFileDialogComponent }  from './new-file-dialog.component';
import { SourceService }  from './editor/source.service';
import { AssemblerService }  from './dcpu/assembler.service';

@NgModule({
  imports:      [
    BrowserModule,
    CodemirrorModule,
    FormsModule,
    MaterialModule,
    RouterModule.forRoot([
      { path: '', redirectTo: '/edit', pathMatch: 'full' },
      { path: 'edit', component: EditingPageComponent },
    ]),
  ],
  declarations: [
    AppComponent,
    EditorComponent,
    EditingPageComponent,
    NewFileDialogComponent,
  ],
  entryComponents: [
    NewFileDialogComponent,
  ],
  providers: [
    { provide: Window, useValue: window },
    SourceService,
    AssemblerService,
  ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
