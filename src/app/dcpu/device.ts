import { DCPU } from './emulator';

export interface Device {
  readonly id: number
  readonly manufacturer: number
  readonly version: number

  interrupt(c: DCPU): void
  tick(c: DCPU): void
  cleanup(): void
}
