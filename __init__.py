from .RetroEngineNode import NODE_CLASS_MAPPINGS as RETRO_ENGINE_NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as RETRO_ENGINE_DISPLAY_NAME_MAPPINGS

NODE_CLASS_MAPPINGS = {
    **RETRO_ENGINE_NODE_CLASS_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **RETRO_ENGINE_DISPLAY_NAME_MAPPINGS,
}

WEB_DIRECTORY = "assets"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]