# Design Notes

This is an Angular 2 Typescript app. It manages DCPU code and disk images,
contains an assembler, emulator and implementations of the hardware.

All the hardware comes from the
[TC-specs repo](https://github.com/techcompliant/TC-Specs).

## Data

- A set of files, which can `.include` each other. Any root file can be sent to
  the DCPU to be executed.
- A set of disk images, each of which can be loaded into exactly one disk drive
  on the DCPU.
- A single DCPU rig, with whatever bag of devices the user wants.


## Emulation

Runs as fast as the browser can go by default, but the displays run at the
spec'd 10Hz, or 15Hz, or whatever it ends up being.

Currently the emulation is native, despite Javascript being crap. Soon we hope
to replace it with a gopherjs-compiled version of GEMU, the official emulator,
to ensure compatibility.

## Hosting Code

Code and disk images are hosted in the cloud, per-user.

Eventually we hope to integrate directly with TC's game servers, to allow
editing of code running inside the game.


## Views

There are three main views:

- Code editing
- Managing hardware (including loading disks)
- The running DCPU with hardware devices and debugger.


### Editor

Uses a customized ACE editor, with DCPU-16 syntax highlighting.

Shows the list of files down the left side. Once a file is selected, it can be
assembled and launched (together with any `.include`d files).

#### Assembler

A custom Javascript assembler is included. It is compatible with TC's official
[DASM](https://github.com/techcompliant/DASM) assembler.

It can handle `.include` directives, macros, and the rest. It's an optimizing
assembler, emitting the smallest encoding for instructions.

#### Syntax Errors

The error reporting is mediocre right now. It'd be great to have editor
integration that highlights errors right in-place, but that's a future
nice-to-have for now.

### Hardware Management

For now, the user manages a single DCPU configuration, which is used to run the
assembly on-demand.

Long-term, it's hoped that the user can manage several DCPUs live at once, and
maintain a set of configurations, choosing which one to target when launching a
new binary.

### DCPU Emulation

This screen captures user input on the whole page as the keyboard. (If multiple
keyboards are attached, input goes to the first one.)

Output devices are rendered in the order they are attached to the DCPU. There's
a bonus pseudo-device, the debugger, which shows `LOG` output and the DCPU
state.


