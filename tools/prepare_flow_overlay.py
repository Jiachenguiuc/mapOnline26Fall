"""Generate a boundary-clipped, Web Mercator PNG from the original ArcGIS grid.
Run: python tools/prepare_flow_overlay.py (rasterio, numpy, pillow required).
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".map-tools"))
import json
import numpy as np
import rasterio
from rasterio.warp import transform_bounds, transform_geom, reproject, Resampling
from rasterio.transform import from_bounds
from rasterio.features import geometry_mask
from PIL import Image

out = ROOT / "data" / "analysis"
out.mkdir(exist_ok=True)
boundary = json.loads((ROOT / "data/LeeFJacksonBoundary.geojson").read_text())
geometries = [f["geometry"] for f in boundary["features"] if f.get("geometry")]
def coords(g):
    def walk(c):
        if isinstance(c[0], (float, int)):
            yield c
        else:
            for child in c:
                yield from walk(child)
    return list(walk(g["coordinates"]))
xy = [c for g in geometries for c in coords(g)]
west, south = min(c[0] for c in xy), min(c[1] for c in xy)
east, north = max(c[0] for c in xy), max(c[1] for c in xy)
extent = transform_bounds("EPSG:4326", "EPSG:3857", west, south, east, north)
width = 1800
height = round(width * (extent[3] - extent[1]) / (extent[2] - extent[0]))
transform = from_bounds(*extent, width, height)
with rasterio.open(ROOT / "data/images/flowacc_log") as src:
    sample = src.read(1, out_shape=(min(2048, src.height), min(2048, src.width)), masked=True)
    valid = sample.compressed()
    valid = valid[np.isfinite(valid) & (np.abs(valid) < 1e20)]
    low, high = np.percentile(valid, [0.5, 99.5]).tolist()
    target = np.full((height, width), np.nan, dtype="float32")
    reproject(source=rasterio.band(src, 1), destination=target,
              src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
              dst_transform=transform, dst_crs="EPSG:3857", dst_nodata=np.nan,
              resampling=Resampling.bilinear)
    target[np.abs(target) >= 1e20] = np.nan
    source_crs = str(src.crs)
mask = geometry_mask([transform_geom("EPSG:4326", "EPSG:3857", g) for g in geometries],
                     out_shape=target.shape, transform=transform, invert=True)
t = np.nan_to_num(np.clip((target - low) / max(high - low, 1e-9), 0, 1))
# Reference image's light-cyan to blue ramp; high accumulation is bluer.
start, end = np.array([224, 249, 255]), np.array([132, 211, 250])
rgba = np.zeros((height, width, 4), dtype="uint8")
rgba[:, :, :3] = (start + t[:, :, None] * (end - start)).astype("uint8")
rgba[:, :, 3] = np.where(mask & np.isfinite(target), 255, 0)
Image.fromarray(rgba).save(out / "flowacc-overlay.png", optimize=True)
metadata = {"bounds": [[south, west], [north, east]], "stretch": [low, high],
            "percentClip": [0.5, 0.5], "gamma": 1, "statistics": "Dataset sampled at up to 2048 x 2048 using nearest resampling",
            "sourceCRS": source_crs, "size": [width, height], "colors": ["#e0f9ff", "#84d3fa"]}
(out / "flowacc-overlay.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata))
