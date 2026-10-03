"""Read individual members of a remote zip via HTTP range requests (no full download)."""
import zipfile
import fsspec

def open_remote_zip(url, block_size=4 * 2 ** 20):
    f = fsspec.open(url, 'rb', block_size=block_size, cache_type='blockcache').open()
    return zipfile.ZipFile(f)
