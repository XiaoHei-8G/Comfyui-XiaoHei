from comfy_api.latest import ComfyExtension, io

from .common import register_model_folder
from .detect import XH_SceneCutDetect, XH_SceneCutDetectAdvanced, XH_SceneCutDetectorLoader, XH_SceneCutRefine
from .files import XH_SceneCutLoadScenes, XH_SceneCutSaveScenes
from .routes import register_routes
from .validation import XH_SceneCutValidate, XH_SceneCutValidatorLoader
from .video import XH_SceneCutLoadVideo
from .view import XH_SceneCutContactSheet
from .viewer import XH_SceneCutSelectedScenes, XH_SceneCutViewer

register_model_folder()
register_routes()

NODES = [
    XH_SceneCutLoadVideo,
    XH_SceneCutDetect,
    XH_SceneCutViewer,
    XH_SceneCutSelectedScenes,
    XH_SceneCutContactSheet,
    XH_SceneCutSaveScenes,
    XH_SceneCutLoadScenes,
    XH_SceneCutDetectorLoader,
    XH_SceneCutDetectAdvanced,
    XH_SceneCutRefine,
    XH_SceneCutValidatorLoader,
    XH_SceneCutValidate,
]


class SceneCutExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return NODES


async def comfy_entrypoint() -> SceneCutExtension:
    return SceneCutExtension()
