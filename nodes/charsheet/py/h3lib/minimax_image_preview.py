"""Read-only dedicated preview; execution never calls this HTTP adapter."""
from .compiler import StateValidationError, decode_json
from .minimax_image_compiler import compile_minimax_image_state as compile_reference13_state
from .preview import HTTP_MAX_BYTES, _preview

# 小黑壳：原作包注册的是 /h3_character_sheet_designer/minimax_image/preview。
# 两边若共用 URL，请求会命中先加载那个包的 handler（连去重标志都是同名全局属性），
# 用户以后替换我们包里的美术图就不会生效。故改用独立路径 + 独立标志。
PREVIEW_PATH = '/xiaohei/character_sheet/minimax_image/preview'


def compile_preview_request(body, *, max_resolution):
    if len(body) > HTTP_MAX_BYTES:
        raise StateValidationError('Preview request is too large.', 'request_too_large')
    try:
        text = body.decode('utf-8', errors='strict')
    except UnicodeDecodeError as exc:
        raise StateValidationError('Preview must be valid UTF-8.', 'invalid_utf8') from exc
    envelope = decode_json(text, byte_limit=HTTP_MAX_BYTES)
    if type(envelope) is not dict or 'state_json' not in envelope or set(envelope)-{'state_json', 'use_layout_image', 'style', 'reference_presence', 'character_presence'}:
        raise StateValidationError('Invalid Reference13 preview request.', 'invalid_request')
    return compile_reference13_state(**envelope, max_resolution=max_resolution)


async def preview(request):
    return await _preview(request, compile_preview_request)


def register_routes():
    try:
        from server import PromptServer
    except ModuleNotFoundError as exc:
        if exc.name == 'server':
            return False
        raise
    instance = getattr(PromptServer, 'instance', None)
    if instance is None:
        return False
    if not getattr(instance, '_xiaohei_minimax_h3_image_sheet_route_registered', False):
        instance.routes.post(PREVIEW_PATH)(preview)
        instance._xiaohei_minimax_h3_image_sheet_route_registered = True
    return True
