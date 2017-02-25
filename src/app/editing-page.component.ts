import { Component } from '@angular/core';
import { MdDialog, MdDialogRef } from '@angular/material';

import 'rxjs/add/operator/toPromise';

import { EditorComponent } from './editor/editor.component';
import { NewFileDialogComponent } from './new-file-dialog.component';
import { SourceService } from './editor/source.service';
import { AssemblerService } from './dcpu/assembler.service';

import { ParseError } from './dcpu/assembler.service';

@Component({
  selector: 'editing-page',
  template: `
    <md-sidenav-container>
      <md-sidenav opened="true" mode="side">
        <div class="file-header">
          <h3>Files</h3>
          <button md-icon-button (click)="newFile()">
            <md-icon>add</md-icon>
          </button>
        </div>
        <md-list>
          <md-list-item *ngFor="let f of filenames"
              [ngClass]="{ 'list-active': f == currentFile }"
              (click)="open(f)">
            {{f}}
          </md-list-item>
        </md-list>
      </md-sidenav>

      <gemu-editor *ngIf="currentFile" [file]="currentFile"></gemu-editor>
      <button (click)="assemble()">Assemble</button>
      <div *ngIf="rom">
        <span *ngFor="let s of rom">{{s}} </span>
      </div>
      <div *ngIf="errors">
        <div *ngFor="let e of errors">{{e.toString()}}</div>
      </div>
    </md-sidenav-container>
  `,
})
export class EditingPageComponent {
  filenames: string[];
  currentFile: string;
  rom: string[];
  errors: ParseError[];

  constructor(private dialog: MdDialog, private sourceService: SourceService, private assembler: AssemblerService) {
    this.filenames = sourceService.listFiles();
    if (this.filenames.length > 0) {
      this.currentFile = this.filenames[0];
    }
  }

  newFile(): void {
    let dialogRef = this.dialog.open(NewFileDialogComponent);
    dialogRef.afterClosed().toPromise().then((result) => {
      this.filenames.push(result);
      this.currentFile = result;
    });
  }

  open(name: string): void {
    this.currentFile = name;
  }

  assemble(): void {
    this.rom = null;
    this.errors = null;

    try {
      this.rom = this.assembler.assemble(this.currentFile).map((n) => n.toString(16));
    } catch(es) {
      this.errors = Array.isArray(es) ? es : [es];
    }
  }
}
