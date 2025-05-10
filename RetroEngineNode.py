"""
Retro Engine Node for ComfyUI
Integrates EmulatorJS with ComfyUI to play various retro games
"""
import os
import glob
import io
import json
import base64
import numpy as np
import torch
from PIL import Image
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
ASSETS_DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
EMULATOR_CORE_DIRECTORY = os.path.join(ASSETS_DIRECTORY, "emulator_core")
HTML_SCALE_FACTOR = 4  
BIOS_DIRECTORY = os.path.join(ASSETS_DIRECTORY, "bios")
BIOS_REQUIRED = {"PlayStation", "SegaCD", "SegaSaturn", "3DO"}
SYSTEM_CONFIG = {
    "PlayStation": ("ps1", [".cue", ".bin", ".iso", ".img", ".chd", ".7z", ".zip", ".rar"], "pcsx_rearmed", ".cue"),
    "GameBoyAdvance": ("gba", [".gba", ".7z", ".zip", ".rar"], "mgba", ".gba"),
    "NES": ("nes", [".nes", ".7z", ".zip", ".rar"], "fceumm", ".nes"),
    "SNES": ("snes", [".smc", ".sfc", ".fig", ".7z", ".zip", ".rar"], "snes9x", ".smc"),
    "N64": ("n64", [".n64", ".z64", ".v64", ".7z", ".zip", ".rar"], "mupen64plus_next", ".n64"),
    "MegaDrive": ("md", [".md", ".smd", ".gen", ".7z", ".zip", ".rar"], "genesis_plus_gx", ".md"),
    "GameBoy": ("gb", [".gb", ".gbc", ".7z", ".zip", ".rar"], "gambatte", ".gb"),
    "VirtualBoy": ("vb", [".vb", ".7z", ".zip", ".rar"], "beetle_vb", ".vb"),
    "NintendoDS": ("nds", [".nds", ".7z", ".zip", ".rar"], "melonds", ".nds"),
    "Atari2600": ("a2600", [".a26", ".bin", ".7z", ".zip", ".rar"], "stella2014", ".a26"),
    "Atari5200": ("a5200", [".a52", ".bin", ".7z", ".zip", ".rar"], "a5200", ".a52"),
    "Atari7800": ("a7800", [".a78", ".7z", ".zip", ".rar"], "prosystem", ".a78"),
    "AtariJaguar": ("jaguar", [".j64", ".jag", ".7z", ".zip", ".rar"], "virtualjaguar", ".j64"),
    "AtariLynx": ("lynx", [".lnx", ".7z", ".zip", ".rar"], "handy", ".lnx"),
    "ColecoVision": ("coleco", [".col", ".rom", ".7z", ".zip", ".rar"], "gearcoleco", ".col"),
    "SegaMasterSystem": ("sms", [".sms", ".7z", ".zip", ".rar"], "smsplus", ".sms"),
    "SegaGameGear": ("gg", [".gg", ".7z", ".zip", ".rar"], "genesis_plus_gx", ".gg"),
    "Sega32X": ("sega32x", ["*.32x", ".7z", ".zip", ".rar"], "picodrive", ".32x"),
    "SegaCD": ("segacd", [".cue", ".iso", ".chd", ".7z", ".zip", ".rar"], "genesis_plus_gx", ".cue"),
    "SegaSaturn": ("saturn", [".cue", ".iso", ".chd", ".7z", ".zip", ".rar"], "yabause", ".cue"),
    "3DO": ("3do", [".iso", ".cue", ".chd", ".7z", ".zip", ".rar"], "opera", ".iso"),
    "Arcade": ("arcade", [".7z", ".zip", ".rar"], "fbneo", ".zip"),
    "MAME2003": ("mame2003", [".7z", ".zip", ".rar"], "mame2003", ".zip"),
    "PSP": ("psp", [".iso", ".cso", ".pbp", ".7z", ".zip", ".rar"], "ppsspp", ".iso"),
    "PC Engine": ("pce", [".pce", ".cue", ".iso", ".7z", ".zip", ".rar"], "mednafen_pce", ".pce"),
    "PC-FX": ("pcfx", [".cue", ".iso", ".chd", ".7z", ".zip", ".rar"], "mednafen_pcfx", ".cue"),
    "NeoGeo Pocket": ("ngp", [".ngp", ".ngc", ".7z", ".zip", ".rar"], "mednafen_ngp", ".ngp"),
    "WonderSwan": ("ws", [".ws", ".wsc", ".7z", ".zip", ".rar"], "mednafen_wswan", ".ws"),
    "Commodore64": ("c64", [".d64", ".t64", ".prg", ".crt", ".tap", ".7z", ".zip", ".rar"], "vice_x64sc", ".d64"),
    "Commodore128": ("c128", [".d81", ".d64", ".7z", ".zip", ".rar"], "vice_x128", ".d81"),
    "Amiga": ("amiga", [".adf", ".ipf", ".7z", ".zip", ".rar", ".rp9"], "puae", ".adf"),
    "CommodorePET": ("pet", [".t64", ".prg", ".7z", ".zip", ".rar"], "vice_xpet", ".prg"),
    "CommodorePlus4": ("plus4", [".t64", ".prg", ".7z", ".zip", ".rar"], "vice_xplus4", ".prg"),
    "CommodoreVIC20": ("vic20", [".t64", ".prg", ".7z", ".zip", ".rar"], "vice_xvic", ".prg"),
}
def log_debug(message):
    """Logs a debug message using the logger."""
    logger.debug(f"[RetroEngineNode] {message}")
def log_error(message):
    """Logs an error message using the logger."""
    logger.error(f"[RetroEngineNode] {message}")
def ensure_directories_exist():
    """Create required asset directories if they don't exist."""
    dirs = [os.path.join(ASSETS_DIRECTORY, "roms", cfg[0])
            for cfg in SYSTEM_CONFIG.values()]
    dirs.append(BIOS_DIRECTORY)
    dirs.extend([
        os.path.join(EMULATOR_CORE_DIRECTORY, "data", "cores"),
        os.path.join(EMULATOR_CORE_DIRECTORY, "data", "compression"),
    ])
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    log_debug("Ensured all asset directories exist.")
def list_files_in_dir(directory, extensions):
    """
    Lists all files matching the given extensions within a specified directory,
    including subdirectories.
    Args:
        directory (str): The absolute path to the directory to search.
        extensions (list): A list of file extensions to look for (e.g., [".zip", ".nes"]).
    Returns:
        list: A list of file paths relative to ASSETS_DIRECTORY, using forward slashes
              for web compatibility. Returns an empty list if the directory doesn't exist
              or no files are found.
    """
    files = []
    base_dir_to_strip = ASSETS_DIRECTORY 
    if not os.path.exists(directory):
        return files
    for ext in extensions:
        abs_pattern = os.path.join(directory, "**", f"*{ext}")
        try:
            found_files = glob.glob(abs_pattern, recursive=True)
        except Exception as e: 
            log_error(f"Error during glob search in '{directory}' with pattern '{abs_pattern}': {e}")
            continue 
        for f_abs in found_files:
            try:
                rel_path_os = os.path.relpath(f_abs, base_dir_to_strip)
                rel_path_web = rel_path_os.replace("\\", "/")
                files.append(rel_path_web)
            except ValueError: 
                log_error(f"Cannot create relative path for '{f_abs}' from '{base_dir_to_strip}'. Are they on different drives?")
            except Exception as e:
                 log_error(f"Error processing path '{f_abs}': {e}")
    return files
def _create_placeholder_tensor(width, height):
    """
    Creates a black placeholder image tensor of the specified dimensions.
    Args:
        width (int): The width of the placeholder image.
        height (int): The height of the placeholder image.
    Returns:
        torch.Tensor: A PyTorch tensor representing a black RGB image,
                      with shape (1, height, width, 3) and normalized float32 values.
    """
    img = Image.new('RGB', (width, height), color='black')
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)
def _decode_screen_data(data_url):
    """Split data URL into header and raw bytes payload."""
    if ',' not in data_url:
        raise ValueError("Invalid Base64 data format; missing comma separator.")
    header, b64 = data_url.split(',', 1)
    return header, base64.b64decode(b64)
class RetroEngineNode:
    """RetroEngineNode: ComfyUI node integrating EmulatorJS for retro gaming.
    Runs various console emulators, captures screen frames, and outputs
    IMAGE tensors. Supports dynamic selection of system, ROM, core, and BIOS.
    """
    _cached_screen_data = None
    _cached_tensor = None
    @classmethod
    def get_roms_for_system(cls, system_name):
        """Return sorted ROM paths for given system; placeholder if none.  """
        roms = []
        config = SYSTEM_CONFIG.get(system_name)
        if config:
            dir_name, extensions, _, placeholder_ext = config
            rom_dir = os.path.join(ASSETS_DIRECTORY, "roms", dir_name)
            placeholder_rom_path = f"roms/{dir_name}/placeholder_select_a_rom{placeholder_ext}".replace("\\", "/")
            roms = list_files_in_dir(rom_dir, extensions)
            if not roms:
                roms = [placeholder_rom_path] 
        else:
            log_error(f"Invalid system name '{system_name}' provided to get_roms_for_system.")
            roms = ["Select a system first"] 
        return sorted(list(set(roms))) 
    @classmethod
    def get_cores_for_system(cls, system_name):
        """Return core name stems or error messages for given system.        """
        cores = []
        config = SYSTEM_CONFIG.get(system_name)
        if config:
            _, _, core_name_stem, _ = config 
            if core_name_stem:  
                core_data_pattern = os.path.join(EMULATOR_CORE_DIRECTORY, "data", "cores", f"{core_name_stem}*.data")
                error_message = f"ERROR_CORE_DATA_MISSING_FOR_{system_name.upper().replace(' ', '_')}_({core_name_stem})"
                found_core_data_files = glob.glob(core_data_pattern)
                if found_core_data_files:
                    cores.append(core_name_stem) 
                else:
                    log_error(f"Core data files missing for '{system_name}' (stem: '{core_name_stem}'). Expected at: '{core_data_pattern}'")
                    cores.append(error_message)
            else:
                cores.append("N/A") 
        else:
            log_error(f"Invalid system name '{system_name}' provided to get_cores_for_system.")
            cores = ["Select a system first"]
        return cores 
    @classmethod
    def _gather_system_options(cls):
        """Build a mapping of each system to its available ROM and core options."""
        options = {}
        for system in sorted(SYSTEM_CONFIG.keys()):
            options[system] = {
                "roms": cls.get_roms_for_system(system),
                "cores": cls.get_cores_for_system(system)
            }
        return options
    @classmethod
    def INPUT_TYPES(s):
        """Define node input types, dynamically populating options for UI."""
        systems = sorted(list(SYSTEM_CONFIG.keys()))
        default_system = "PlayStation" if "PlayStation" in systems else (systems[0] if systems else "N/A")
        all_options_data_for_js = s._gather_system_options()
        all_roms_options = []
        all_cores_options = []
        if default_system == "N/A" or not systems:
            log_error("CRITICAL: No systems defined in SYSTEM_CONFIG or SYSTEM_CONFIG is empty. RetroEngineNode will be non-functional.")
            placeholder_msg = "Node disabled: No Systems in Config"
            return {
                "required": {
                    "system": (["N/A"], {"default": "N/A"}),
                    "game_rom_path": ([placeholder_msg], {"default": placeholder_msg}),
                    "core": ([placeholder_msg], {"default": placeholder_msg}),
                    "bios_path": (["N/A"], {"default": "N/A"}),
                    "width": ("INT", {"default": 640, "min": 320, "max": 1920, "step": 8}),
                    "height": ("INT", {"default": 480, "min": 240, "max": 1080, "step": 8}),
                },
                "optional": {
                    "all_options": ("STRING", {"default": "{}", "hidden": True, "multiline": True}),
                    "screen_data": ("STRING", {"default": "", "hidden": True, "multiline": True}),
                }
            }
        for opts in all_options_data_for_js.values():
            all_roms_options.extend(opts["roms"])
            all_cores_options.extend(opts["cores"])
        all_roms_options = sorted(list(set(all_roms_options))) if all_roms_options else ["Select ROM for System"]
        all_cores_options = sorted(list(set(all_cores_options))) if all_cores_options else ["Select Core for System"]
        all_options_json_for_js = json.dumps(all_options_data_for_js)
        bios_files = list_files_in_dir(BIOS_DIRECTORY, [".bin", ".rom"]) 
        bios_options = sorted(list(set(bios_files))) + ["N/A"] 
        default_bios = bios_options[0] if bios_files else "N/A"
        default_rom = all_roms_options[0] 
        if default_system in all_options_data_for_js:
            system_specific_roms = all_options_data_for_js[default_system].get("roms", [])
            non_placeholder_roms = [r for r in system_specific_roms if not r.startswith("placeholder_select_a_rom")]
            if non_placeholder_roms:
                default_rom = non_placeholder_roms[0]
            elif system_specific_roms: 
                default_rom = system_specific_roms[0]
        default_core = all_cores_options[0] 
        if default_system in all_options_data_for_js:
            system_specific_cores = all_options_data_for_js[default_system].get("cores", [])
            valid_cores = [c for c in system_specific_cores if not c.startswith("ERROR_CORE_DATA_MISSING")]
            if valid_cores:
                actual_core_names = [c for c in valid_cores if c != "N/A"]
                if actual_core_names:
                    default_core = actual_core_names[0]
                else: 
                    default_core = valid_cores[0]
            elif system_specific_cores: 
                default_core = system_specific_cores[0]
        return {
            "required": {
                "system": (systems, {"default": default_system}),
                "game_rom_path": (all_roms_options, {"default": default_rom}),
                "core": (all_cores_options, {"default": default_core}),
                "bios_path": (bios_options, {"default": default_bios}),
                "width": ("INT", {"default": 640, "min": 320, "max": 1920, "step": 8}),
                "height": ("INT", {"default": 480, "min": 240, "max": 1080, "step": 8}),
            },
            "optional": {
                "all_options": ("STRING", {"default": all_options_json_for_js, "hidden": True, "multiline": True}),
                "screen_data": ("STRING", {"default": "", "hidden": True, "multiline": True}),
            }
        }
    FUNCTION = "run"
    CATEGORY = "Retro Engine"
    RETURN_TYPES = ("STRING", "IMAGE",) 
    RETURN_NAMES = ("status", "screen_capture",)
    def _validate_inputs(self, system, game_rom_path, core, bios_path):
        """Validate system, ROM, core, BIOS inputs; return (passed, message)."""
        rom_error_conditions = [
            game_rom_path.startswith("placeholder_select_a_rom"),
            game_rom_path in ("Select ROM for System", "Node disabled: No Systems in Config", "Select a system first"),
        ]
        if not game_rom_path or any(rom_error_conditions):
            return False, f"Error: No valid ROM file selected for '{system}'. Current ROM: '{game_rom_path}'"
        if not os.path.exists(os.path.join(ASSETS_DIRECTORY, game_rom_path)):
            return False, f"Error: ROM file '{game_rom_path}' not found at '{os.path.join(ASSETS_DIRECTORY, game_rom_path)}'"
        cfg = SYSTEM_CONFIG.get(system, ())
        expected_core_stem = cfg[2] if len(cfg) > 2 else None
        core_error_conditions = [
            core.startswith("ERROR_CORE_DATA_MISSING"),
            core in ("Select Core for System", "Node disabled: No Systems in Config", "Select a system first"),
        ]
        if expected_core_stem and any(core_error_conditions):
            return False, f"Error: Core '{core}' is invalid or missing for system '{system}'"
        if system in BIOS_REQUIRED:
            bios_errors = [not bios_path or bios_path == "N/A" or bios_path.startswith("placeholder_select_bios")]
            if any(bios_errors):
                return False, f"Error: BIOS file is required for '{system}' but none is selected/valid (current: '{bios_path}')"
            if not os.path.exists(os.path.join(ASSETS_DIRECTORY, bios_path)):
                return False, f"Error: Selected BIOS file '{bios_path}' not found at '{os.path.join(ASSETS_DIRECTORY, bios_path)}'"
        return True, f"Inputs validated for {system}. ROM: {os.path.basename(game_rom_path)}"
    def _process_screen_data(self, screen_data, width, height, system, game_rom_path):
        """Decode and process Base64 screen data into tensor and status message."""
        processed_tensor = None
        status_message = None
        if screen_data:
            log_debug(f"Processing new screen data. Length: {len(screen_data)}")
            try:
                header, decoded = _decode_screen_data(screen_data)
                img_np = None
                if header.startswith('data:application/octet-stream'):
                    w0, h0 = width // HTML_SCALE_FACTOR, height // HTML_SCALE_FACTOR
                    if len(decoded) != w0 * h0 * 3:
                        raise ValueError("Raw pixel data size invalid.")
                    arr = np.frombuffer(decoded, dtype=np.uint8).reshape((h0, w0, 3))
                    img = Image.fromarray(arr, 'RGB')
                    if img.size != (width, height):
                        img = img.resize((width, height), Image.Resampling.LANCZOS)
                    img_np = np.array(img)
                elif header.startswith('data:image/'):
                    img = Image.open(io.BytesIO(decoded))
                    if img.mode != 'RGB': img = img.convert('RGB')
                    if img.size != (width, height):
                        img = img.resize((width, height), Image.Resampling.LANCZOS)
                    img_np = np.array(img)
                else:
                    raise ValueError(f"Unsupported header: {header}")
                processed_tensor = torch.from_numpy(img_np.astype(np.float32) / 255.0).unsqueeze(0)
                status_message = f"Screen capture processed: {system} - {os.path.basename(game_rom_path)}"
                log_debug(f"Successfully processed screen data. Tensor shape: {processed_tensor.shape}")
                RetroEngineNode._cached_screen_data = screen_data
                RetroEngineNode._cached_tensor = processed_tensor
            except Exception as e:
                log_error(f"Error processing screen capture: {e}")
                status_message = f"Error processing screen capture: {e}"
        else:
            status_message = f"Emulator for '{system}' is ready. No new screen capture data provided."
            log_debug(status_message)
        if processed_tensor is None:
            log_debug("No valid screen data; using placeholder tensor.")
            processed_tensor = _create_placeholder_tensor(width, height)
        return processed_tensor, status_message
    def run(self, system, game_rom_path, core, bios_path, width, height, all_options, screen_data=None):
        """Execute node: validate inputs, process or reuse cached screen, return (status, tensor)."""
        _ = all_options
        passed, status = self._validate_inputs(system, game_rom_path, core, bios_path)
        if not passed:
            log_error(status)
            return (status, _create_placeholder_tensor(width, height))
        log_debug(f"Run - System: {system}, ROM: '{game_rom_path}', Core: '{core}', BIOS: '{bios_path}', ScreenData Len: {len(screen_data) if screen_data else 'None'}")
        if RetroEngineNode._cached_screen_data == screen_data and RetroEngineNode._cached_tensor is not None:
            log_debug("Screen data unchanged, returning cached tensor.")
            status = f"Cached screen capture: {system} - {os.path.basename(game_rom_path)}"
            return (status, RetroEngineNode._cached_tensor)
        processed_tensor, status = self._process_screen_data(screen_data, width, height, system, game_rom_path)
        return (status, processed_tensor)
NODE_CLASS_MAPPINGS = {
    "RetroEngineNode": RetroEngineNode
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "RetroEngineNode": "Retro Engine"
}
WEB_DIRECTORY = "assets" 