import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { SourceService } from './source.service';

@Component({
  selector: 'gemu-editor',
  template: `
    <codemirror
        [(ngModel)]="code"
        [config]="{}"
        (blur)="onBlur()">
    </codemirror>
  `,
})
export class EditorComponent implements OnChanges {
  @Input() file: string;
  code: string;

  constructor(public sourceService: SourceService) {}

  private save(file: string, code: string): void {
    this.sourceService.saveFile(file, code);
  }

  private load(file: string) {
    this.code = this.sourceService.getFile(file);
  }

  onBlur(): void {
    this.save(this.file, this.code);
  }

  ngOnChanges(rec: SimpleChanges) {
    if ('file' in rec) {
      let ch = rec['file'];
      if (!ch.isFirstChange()) {
        this.save(ch.previousValue, this.code);
      }
      this.load(ch.currentValue);
    }
  }
}
