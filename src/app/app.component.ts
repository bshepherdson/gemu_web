import { Component } from '@angular/core';
import { EditorComponent } from './editor/editor.component';
import { EmulatorComponent } from './dcpu/emulator.component';

@Component({
  selector: 'gemu-app',
  template: `
    <h1>GEMU</h1>
    <gemu-editor file="main.asm"></gemu-editor>
  `,
})
export class AppComponent  {
}
