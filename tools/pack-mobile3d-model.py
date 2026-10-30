"""Repack embedded GLB textures for mobile while preserving geometry, skins and clips.

Usage: python3 tools/pack-mobile3d-model.py source.glb output.glb
Requires Pillow. Never overwrites the source. Mesh topology is prepared in Meshy.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
from PIL import Image


def pack(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Source and output must differ')
    raw = source.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546c67 or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB 2.0 header')
    size, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4e4f534a:
        raise ValueError('Missing JSON chunk')
    doc = json.loads(raw[20:20+size])
    binary_size, binary_type = struct.unpack_from('<II', raw, 20+size)
    if binary_type != 0x004e4942:
        raise ValueError('Missing BIN chunk')
    binary = raw[28+size:28+size+binary_size]
    replacements, textures = {}, []
    base_images = set()
    for material in doc.get('materials', []):
        texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if texture:
            base_images.add(doc['textures'][texture['index']]['source'])
    for index, image in enumerate(doc.get('images', [])):
        if 'bufferView' not in image:
            raise ValueError('External images are not allowed in the self-contained prototype')
        view_index = image['bufferView']
        view = doc['bufferViews'][view_index]
        image_bytes = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        with Image.open(io.BytesIO(image_bytes)) as img:
            original = img.size
            limit = 1024 if index in base_images else 512
            img.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            has_alpha = 'A' in img.getbands() and img.getextrema()[-1][0] < 255
            fmt = 'JPEG' if index in base_images and not has_alpha else 'PNG'
            if fmt == 'JPEG':
                img = img.convert('RGB')
            output = io.BytesIO()
            img.save(output, fmt, **({'quality':88,'optimize':True} if fmt=='JPEG' else {'optimize':True}))
            replacements[view_index] = output.getvalue()
            image['mimeType'] = 'image/jpeg' if fmt=='JPEG' else 'image/png'
            textures.append({'image':index,'from':original,'to':img.size,'bytes':len(replacements[view_index])})
    chunks, offset = [], 0
    for index, view in enumerate(doc.get('bufferViews', [])):
        if view.get('buffer', 0) != 0:
            raise ValueError('Only one embedded buffer is supported')
        data = replacements.get(index)
        if data is None:
            start = view.get('byteOffset', 0)
            data = binary[start:start+view['byteLength']]
        view['byteOffset'], view['byteLength'] = offset, len(data)
        padding = (-len(data)) % 4
        chunks.extend([data, b'\0'*padding]); offset += len(data)+padding
    doc['buffers'] = [{'byteLength':offset}]
    doc['asset'].setdefault('extras', {})['mobile3d'] = {'sourceSha256':hashlib.sha256(raw).hexdigest(),'textures':textures}
    header = json.dumps(doc,separators=(',',':')).encode(); header += b' '*((-len(header))%4)
    body = b''.join(chunks)
    result = struct.pack('<III',magic,2,28+len(header)+len(body))+struct.pack('<II',len(header),kind)+header+struct.pack('<II',len(body),binary_type)+body
    destination.parent.mkdir(parents=True,exist_ok=True); destination.write_bytes(result)
    print(json.dumps({'sourceBytes':len(raw),'mobileBytes':len(result),'skins':len(doc.get('skins',[])),
                      'animations':len(doc.get('animations',[])),'textures':textures}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('destination')
    args = parser.parse_args(); pack(args.source,args.destination)
