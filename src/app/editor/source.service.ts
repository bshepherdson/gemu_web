import { Injectable } from '@angular/core';

@Injectable()
export class SourceService {
  constructor(private wdw: Window) {}

  public listFiles(): string[] {
    let names: string[] = [];
    var store = this.wdw.localStorage;
    for (let i = 0; i < store.length; i++) {
      if (store.key(i).substring(0, 4) === 'asm-') {
        names.push(store.key(i).substring(4));
      }
    }
    return names;
  }

  public getFile(name: string): string {
    return this.wdw.localStorage.getItem('asm-' + name);
  }

  public saveFile(name: string, code: string): void {
    this.wdw.localStorage.setItem('asm-' + name, code);
  }
}
