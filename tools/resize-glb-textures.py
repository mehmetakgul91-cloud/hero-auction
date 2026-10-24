"""Offline GLB texture optimization; needs Pillow, never runs on the server."""
import io, json, struct, sys
from pathlib import Path
from PIL import Image

source, destination = sys.argv[1:3]
raw = Path(source).read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length])
binary = raw[28+length:]
image_views = {image['bufferView'] for image in doc['images']}
base = doc['textures'][doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
base_view = doc['images'][base]['bufferView']
chunks, offset = [], 0
for index, view in enumerate(doc['bufferViews']):
    value = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
    if index in image_views:
        image = Image.open(io.BytesIO(value)).convert('RGB')
        size = 1024 if index == base_view else 512
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, 'JPEG', quality=88, optimize=True)
        value = out.getvalue()
    view.update(byteOffset=offset, byteLength=len(value))
    pad = b'\0' * (-len(value) % 4)
    chunks.extend([value, pad])
    offset += len(value) + len(pad)
doc['buffers'] = [{'byteLength': offset}]
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
body = b''.join(chunks)
result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(body)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(body), 0x004e4942) + body
Path(destination).write_bytes(result)
print(json.dumps({'before':len(raw),'after':len(result),'output':destination}))
