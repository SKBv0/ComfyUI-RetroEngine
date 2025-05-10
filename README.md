<div align="center">
  <h1>Retro Engine Node for ComfyUI</h1>
  <img src="assets/logo.png" alt="Retro Engine Logo" width="200"/>
</div>

This custom node integrates **[EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)** into ComfyUI, allowing you to run retro games and capture their screens for your image generation workflows.

## Key Features

-   Run games from many classic consoles.
-   Dynamically select systems, ROMs, and emulator cores.
-   Automatically capture emulator screens into your ComfyUI workflow.

## Installation

1.  **Add to ComfyUI:**
    *   Place the `ComfyUI-RetroEngine` folder (this repository) into your ComfyUI `custom_nodes` directory.

2.  **Install Emulator Cores (Required):**
    *   This node uses EmulatorJS cores which need to be installed via npm. 
    *   To install all official cores (recommended for ease): 
        ```bash
        npm install @emulatorjs/cores
        ```
    *   Alternatively, to install a specific core (e.g., `snes9x` for SNES):
        ```bash
        npm install @emulatorjs/core-snes9x
        ```
    *   *Ensure npm is installed on your system.



## Basic Usage

1.  **Place Game Files:**
    *   Put your game ROMs into the `ComfyUI-RetroEngine/assets/roms/[SYSTEM_FOLDER]/` directory (e.g., `assets/roms/snes/` for SNES games).
    *   If a system requires a BIOS file (like PlayStation), place it in `ComfyUI-RetroEngine/assets/bios/`.

2.  **Add and Configure Node:**
    *   Add the "Retro Engine" node to your ComfyUI workflow.
    *   **System:** Choose the game system (e.g., SNES, PlayStation).
    *   **Game ROM:** Select your game from the list.
    *   **Core:** Ensure an appropriate core is selected (usually automatic).
    *   **BIOS:** If needed for the system, select the BIOS file.
    *   **Width/Height:** Set the desired output image size.

3.  **Run Emulator & Capture:**
    *   Click the **POWER (⏻)** button on the node to start the emulator in a new window.
    *   Navigate to the desired screen in your game.
    *   Queue the ComfyUI prompt. The node will capture the screen and output it as an IMAGE.

## Important Notes & Troubleshooting

*   **BIOS Required for Some Systems:** Systems like PlayStation, SegaCD, Saturn, and 3DO **must** have a correct BIOS file selected in the node to work.
*   **Emulator Cores Not Found?** If the node can't find a core for a selected system, or you get errors related to cores:
    *   Ensure you have installed the necessary cores via `npm install @emulatorjs/cores` or `npm install @emulatorjs/core-<core_name>` (see Installation section).
    *   The node will try to pick a default core, but some systems might offer multiple. You might need to select one from the "Core" dropdown.
*   **Game ROMs/BIOS Not Listed?** 
    *   Make sure files are in the correct `assets/roms/[SYSTEM_FOLDER]/` or `assets/bios/` subdirectories within the `ComfyUI-RetroEngine` folder.
    *   Restart ComfyUI after adding new game files.


## Credits

-   This ComfyUI node heavily utilizes and is made possible by the **[EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)** project. 
    -   For more details on the core emulation technology, please visit their [GitHub page](https://github.com/EmulatorJS/EmulatorJS) or [emulatorjs.org](https://emulatorjs.org/).

