import { Component } from '@angular/core';
import { MdDialogRef } from '@angular/material';

@Component({
  selector: 'new-file-dialog',
  template: `
    <h3 md-dialog-title>New File</h3>
    <md-dialog-content>
      <form>
        <md-input-container>
          <input name="name" tabindex="1" mdInput placeholder="New File" [(ngModel)]="name">
        </md-input-container>
      </form>
    </md-dialog-content>
    <md-dialog-actions>
      <button md-raised-button (click)="create()">Create</button>
      <button md-raised-button md-dialog-close>Cancel</button>
    </md-dialog-actions>
  `,
})
export class NewFileDialogComponent {
  name: string;

  constructor(private dialogRef: MdDialogRef<NewFileDialogComponent>) {}

  create(): void {
    this.dialogRef.close(this.name);
  }
}
