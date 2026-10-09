#!/usr/bin/env python3
"""Pinned official MediaMTX binary; build only, never fetch at runtime."""
import hashlib, io, os, pathlib, tarfile, urllib.request
VERSION = '1.21.2'
SHA256 = '121be6e00397e473a95d83c75f4fcd3819a6af3b0e1a50889cba43ab4fab6a27'
url = f'https://github.com/bluenviron/mediamtx/releases/download/v{VERSION}/mediamtx_v{VERSION}_linux_amd64.tar.gz'
data = urllib.request.urlopen(url, timeout=120).read()
if hashlib.sha256(data).hexdigest() != SHA256:
    raise SystemExit('MediaMTX checksum mismatch')
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
    binary = archive.extractfile('mediamtx').read()
    license_text = archive.extractfile('LICENSE').read()
prefix = pathlib.Path(os.environ.get('MEDIAMTX_INSTALL_PREFIX', '/usr/local'))
(prefix / 'bin').mkdir(parents=True, exist_ok=True)
(prefix / 'share').mkdir(parents=True, exist_ok=True)
target = prefix / 'bin' / 'mediamtx'
target.write_bytes(binary)
target.chmod(0o755)
(prefix / 'share' / 'mediamtx-LICENSE').write_bytes(license_text)
