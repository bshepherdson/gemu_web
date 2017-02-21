import { R, DCPU } from './emulator';
import { Device } from './device';

export class LEM1802 implements Device {
  id: number = 0x734df615;
  manufacturer: number = 0x1c6c8b36;
  version: number = 0x1802;

  private static SCALE_FACTOR = 4;
  private static WIDTH_CHARS  = 32;
  private static HEIGHT_CHARS = 12;
  private static FONT_WIDTH   = 4;
  private static FONT_HEIGHT  = 8;
  private static WIDTH_PX     = LEM1802.FONT_WIDTH * LEM1802.WIDTH_CHARS
  private static HEIGHT_PX    = LEM1802.FONT_HEIGHT * LEM1802.HEIGHT_CHARS

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private vram: number;
  private fontram: number;
  private palram: number;
  private border: number;
  private frameSkip: number = 6; // Every 6 frames = 10Hz.

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  public interrupt(c: DCPU): void {
    let base: number;
    switch (c.regs[R.A]) {
      case 0: // MAP_SCREEN
        this.vram = c.regs[R.B];
        break;
      case 1: // MAP_FONT
        this.fontram = c.regs[R.B];
        break;
      case 2: // MAP_PALETTE
        this.palram = c.regs[R.B];
        break;
      case 3: // SET_BORDER_COLOR
        this.border = c.regs[R.B];
        break;

      case 4: // MEM_DUMP_FONT
        base = c.regs[R.B];
        for (let i = 0; i < 256; i++) {
          c.mem[base + i] = LEM1802.DEFAULT_FONT[i];
        }
        c.waitStates += 256;
        break;

      case 5: // MEM_DUMP_PALETTE
        base = c.regs[R.B];
        for (let i = 0; i < 16; i++) {
          c.mem[base + i] = LEM1802.DEFAULT_PALETTE[i];
        }
        c.waitStates += 16;
        break;

      case 0xffff: // RESET
        this.vram = 0;
        this.fontram = 0;
        this.palram = 0;
        this.border = 0;
        this.canvas.style.border = 'none';
        break;
    }
  }

  public tick(c: DCPU): void {}

  private paintDisplay(c: DCPU): void {
    // TODO: Paint the display black instead, when VRAM is 0.
    if (this.vram == 0) return;

    let imageData = this.ctx.createImageData(LEM1802.WIDTH_PX, LEM1802.HEIGHT_PX);

    // Palette is an array of LEM-formatted colours.
    let palette = this.readPalette(c);
    // Font is an array of LEM-formatted font data.
    let font = this.readFont(c);

    for (let i = 0; i < LEM1802.HEIGHT_CHARS; i++) {
      for (let j = 0; j < LEM1802.WIDTH_CHARS; j++) {
        imageData.data
        var charIndex = this.vram + i * LEM1802.WIDTH_CHARS + j;
        this.writeCharacter(imageData.data, font, palette, c.mem[charIndex], i, j);
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Render the border.
    this.canvas.style.border = '2px solid #' + palette[this.border].toString(16);
  }

  private writeCharacter(data: Uint8ClampedArray, font: number[],
                         palette: number[], c: number, row: number, col: number
                        ) {
    // Char is formatted as ffffbbbbBccccccc.
    let ch = c & 0x7f; // Actual character index.

    let fontLo = font[ch * 2] | 0;
    let fontHi = font[ch * 2 + 1] | 0;

    // Now write the pixels, where the LSB in each half-word is the topmost
    // pixel in that row.
    let y = row * LEM1802.FONT_HEIGHT;
    let x = col * LEM1802.FONT_WIDTH;
    let fg = palette[(c >> 12) & 0xf];
    let bg = palette[(c >> 8)  & 0xf];

    this.writeColumn(data, fg, bg, x    , y, fontLo >> 8);
    this.writeColumn(data, fg, bg, x + 1, y, fontLo);
    this.writeColumn(data, fg, bg, x + 2, y, fontHi >> 8);
    this.writeColumn(data, fg, bg, x + 3, y, fontHi);
  }

  private writeColumn(data: Uint8ClampedArray, fg: number, bg: number,
                      x: number, y: number, pixels: number) {
    for (let i = 0; i < 8; i++) {
      let b = (pixels >> i) & 1;
      let c = b === 1 ? fg : bg;
      this.writePixel(data, c, x, y + i);
    }
  }

  private writePixel(data: Uint8ClampedArray, c: number, x: number, y: number) {
    // TODO: Cache the palette decoding for speed.
    let index = y * LEM1802.WIDTH_PX * 4 + x * 4;
    let r = (c >> 8) & 0xf;
    let g = (c >> 4) & 0xf;
    let b = c & 0xf;

    data[index] = (r << 4) | r;
    data[index + 1] = (g << 4) | g;
    data[index + 2] = (b << 4) | b;
    data[index + 3] = 0xff;
  }

  private readFont(c: DCPU): number[] {
    return this.fontram !== 0 ?
        c.mem.slice(this.fontram, this.fontram + 256) :
        LEM1802.DEFAULT_FONT;
  }

  private readPalette(c: DCPU): number[] {
    return this.palram !== 0 ?
        c.mem.slice(this.palram, this.palram + 16) :
        LEM1802.DEFAULT_PALETTE;
  }

  public cleanup(): void {}


  private static DEFAULT_PALETTE = [
    0x0000, 0x000a, 0x00a0, 0x00aa,
    0x0a00, 0x0a0a, 0x0aa0, 0x0aaa,
    0x0555, 0x055f, 0x05f5, 0x05ff,
    0x0f55, 0x0f5f, 0x0ff5, 0x0fff,
  ];

  private static DEFAULT_FONT = [
    0xb79e, 0x388e, // 0x00 - blob thingy 1
    0x722c, 0x75f4, // 0x01 - blob thingy 2
    0x19bb, 0x7f8f, // 0x02 - blob thingy 3
    0x85f9, 0xb158, // 0x03 - blob thingy 4
    0x242e, 0x2400, // 0x04 - plus/minus
    0x082a, 0x0800, // 0x05 - division
    0x0008, 0x0000, // 0x06 - centered dot
    0x0808, 0x0808, // 0x07 - centered horizontal line
    0x00ff, 0x0000, // 0x08 - centered vertical line
    0x00f8, 0x0808, // 0x09 - outline SE quarter
    0x08f8, 0x0000, // 0x0a - outline SW quarter
    0x080f, 0x0000, // 0x0b - outline NW quarter
    0x000f, 0x0808, // 0x0c - outline NE quarter
    0x00ff, 0x0808, // 0x0d - vertical bar with E leg
    0x08f8, 0x0808, // 0x0e - horizontal bar with S leg
    0x08ff, 0x0000, // 0x0f - vertical bar with W leg

    0x080f, 0x0808, // 0x10 - horizontal bar with N leg
    0x08ff, 0x0808, // 0x11 - cross
    0x6633, 0x99cc, // 0x12 - cross-diagonal lines
    0x9933, 0x66cc, // 0x13 - main-diagonal lines
    0xfef8, 0xe080, // 0x14 - diagonal SW half
    0x7f1f, 0x0301, // 0x15 - diagonal NW half
    0x0107, 0x1f7f, // 0x16 - diagonal NE half
    0x80e0, 0xf8fe, // 0x17 - diagonal SE half
    0x5500, 0xaa00, // 0x18 - dotted lines
    0x55aa, 0x55aa, // 0x19 - checkerboard
    0xffaa, 0xff55, // 0x1a - negative space dotted lines
    0x0f0f, 0x0f0f, // 0x1b - N half
    0xf0f0, 0xf0f0, // 0x1c - S half
    0x0000, 0xffff, // 0x1d - E half
    0xffff, 0x0000, // 0x1e - W half
    0xffff, 0xffff, // 0x1f - wholly filled

    0x0000, 0x0000, // 0x20 - space (wholly empty)
    0x005f, 0x0000, // 0x21 - !
    0x0300, 0x0300, // 0x22 - "
    0x1f05, 0x1f00, // 0x23 - #
    0x266b, 0x3200, // 0x24 - $
    0x611c, 0x4300, // 0x25 - %
    0x3629, 0x7650, // 0x26 - &
    0x0002, 0x0100, // 0x27 - '
    0x1c22, 0x4100, // 0x28 - (
    0x4122, 0x1c00, // 0x29 - )
    0x1408, 0x1400, // 0x2a - *
    0x081c, 0x0800, // 0x2b - +
    0x4020, 0x0000, // 0x2c - ,
    0x8080, 0x8000, // 0x2d - -
    0x0040, 0x0000, // 0x2e - .
    0x601c, 0x0300, // 0x2f - /

    0x3e49, 0x3e00, // 0x30 - 0
    0x427f, 0x4000, // 0x31 - 1
    0x6259, 0x4600, // 0x32 - 2
    0x2249, 0x3600, // 0x33 - 3
    0x0f08, 0x7f00, // 0x34 - 4
    0x2745, 0x3900, // 0x35 - 5
    0x3e49, 0x3200, // 0x36 - 6
    0x6119, 0x0700, // 0x37 - 7
    0x3649, 0x3600, // 0x38 - 8
    0x2649, 0x3e00, // 0x39 - 9
    0x0024, 0x0000, // 0x3a - :
    0x4024, 0x0000, // 0x3b - ;
    0x0814, 0x2200, // 0x3c - <
    0x1414, 0x1400, // 0x3d - =
    0x2214, 0x0800, // 0x3e - >
    0x0259, 0x0600, // 0x3f - ?

    0x3e59, 0x5e00, // 0x40 - @
    0x7e09, 0x7e00, // 0x41 - A
    0x7f49, 0x3600, // 0x42 - B
    0x3e41, 0x2200, // 0x43 - C
    0x7f41, 0x3e00, // 0x44 - D
    0x7f49, 0x4100, // 0x45 - E
    0x7f09, 0x0100, // 0x46 - F
    0x3e41, 0x7a00, // 0x47 - G
    0x7f08, 0x7f00, // 0x48 - H
    0x417f, 0x4100, // 0x49 - I
    0x2040, 0x3f00, // 0x4a - J
    0x7f08, 0x7700, // 0x4b - K
    0x7f40, 0x4000, // 0x4c - L
    0x7f06, 0x7f00, // 0x4d - M
    0x7f01, 0x7e00, // 0x4e - N
    0x3e41, 0x3e00, // 0x4f - O

    0x7f09, 0x0600, // 0x50 - P
    0x3e61, 0x7e00, // 0x51 - Q
    0x7f09, 0x7600, // 0x52 - R
    0x2649, 0x3200, // 0x53 - S
    0x017f, 0x0100, // 0x54 - T
    0x3f40, 0x7f00, // 0x55 - U
    0x1f60, 0x1f00, // 0x56 - V
    0x7f30, 0x7f00, // 0x57 - W
    0x7780, 0x7700, // 0x58 - X
    0x0778, 0x0700, // 0x59 - Y
    0x7149, 0x4700, // 0x5a - Z
    0x007f, 0x4100, // 0x5b - [
    0x031c, 0x6000, // 0x5c - \
    0x417f, 0x0000, // 0x5d - ]
    0x0201, 0x0200, // 0x5e - ^
    0x8080, 0x8000, // 0x5f - _

    0x0001, 0x0200, // 0x60 - `
    0x0204, 0x5400, // 0x61 - a
    0x7f44, 0x3800, // 0x62 - b
    0x3844, 0x2800, // 0x63 - c
    0x3844, 0x7f00, // 0x64 - d
    0x3854, 0x5800, // 0x65 - e
    0x087e, 0x0900, // 0x66 - f
    0x4854, 0x3c00, // 0x67 - g
    0x7f04, 0x7800, // 0x68 - h
    0x047d, 0x0000, // 0x69 - i
    0x2040, 0x3d00, // 0x6a - j
    0x7f10, 0x6c00, // 0x6b - k
    0x017f, 0x0000, // 0x6c - l
    0x7c18, 0x7c00, // 0x6d - m
    0x7c04, 0x7800, // 0x6e - n
    0x3842, 0x3800, // 0x6f - o

    0x7c14, 0x0800, // 0x70 - p
    0x0814, 0x7c00, // 0x71 - q
    0x7c04, 0x0800, // 0x72 - r
    0x4854, 0x2400, // 0x73 - s
    0x043e, 0x4400, // 0x74 - t
    0x3c40, 0x7c00, // 0x75 - u
    0x1c60, 0x1c00, // 0x76 - v
    0x7c30, 0x7c00, // 0x77 - w
    0x6c10, 0x6c00, // 0x78 - x
    0x4c50, 0x3c00, // 0x79 - y
    0x6454, 0x4c00, // 0x7a - z
    0x0836, 0x4100, // 0x7b - {
    0x0077, 0x0000, // 0x7c - |
    0x4136, 0x0800, // 0x7d - }
    0x0201, 0x0201, // 0x7e - ~
    0x0205, 0x0200, // 0x7f - degrees
  ];
}
