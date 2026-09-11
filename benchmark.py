"""
AYN NEE ETHA — Performance Benchmark

Measures /analyze request timing across multiple iterations.

Usage:
    python benchmark.py                          # defaults: person_only.jpg, 10 iterations
    python benchmark.py test_images/photo.jpg 20  # custom image, 20 iterations
"""
import os
import sys
import time
import io
import json
import warnings
import statistics

warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def run_benchmark(image_path: str, iterations: int = 10):
    if not os.path.exists(image_path):
        print(f"ERROR: Image not found: {image_path}")
        sys.exit(1)

    # Read image once
    with open(image_path, "rb") as f:
        image_data = f.read()

    image_size_kb = len(image_data) / 1024
    print()
    print("=" * 60)
    print("  AYN NEE ETHA — Performance Benchmark")
    print("=" * 60)
    print()
    print(f"Image: {os.path.basename(image_path)}")
    print(f"File size: {image_size_kb:.1f} KB")
    print(f"Iterations: {iterations}")
    print()

    # Warm-up run (not counted)
    print("Warm-up run...", flush=True)
    warmup_res = client.post("/analyze", files={"file": ("bench.jpg", io.BytesIO(image_data), "image/jpeg")})
    if warmup_res.status_code != 200:
        print(f"ERROR: Warm-up failed with status {warmup_res.status_code}")
        sys.exit(1)

    warmup_data = warmup_res.json()
    img_w = warmup_data["image_width"]
    img_h = warmup_data["image_height"]
    num_detections = len(warmup_data["detections"])

    print(f"Image dimensions: {img_w} x {img_h}")
    print(f"Detections: {num_detections}")
    print()

    # Benchmark runs
    times = []
    print(f"Running {iterations} iterations...", flush=True)
    for i in range(iterations):
        t_start = time.perf_counter()
        res = client.post("/analyze", files={"file": ("bench.jpg", io.BytesIO(image_data), "image/jpeg")})
        t_end = time.perf_counter()

        elapsed_ms = (t_end - t_start) * 1000
        times.append(elapsed_ms)

        assert res.status_code == 200, f"Request {i+1} failed with status {res.status_code}"
        print(f"  Run {i+1:>3}: {elapsed_ms:>8.1f} ms", flush=True)

    # Statistics
    avg_ms = statistics.mean(times)
    min_ms = min(times)
    max_ms = max(times)
    median_ms = statistics.median(times)
    if len(times) >= 2:
        stdev_ms = statistics.stdev(times)
    else:
        stdev_ms = 0.0

    print()
    print("-" * 40)
    print(f"  Results ({iterations} iterations)")
    print("-" * 40)
    print(f"  Image:      {os.path.basename(image_path)} ({img_w}x{img_h})")
    print(f"  Detections: {num_detections}")
    print(f"  Average:    {avg_ms:.1f} ms")
    print(f"  Median:     {median_ms:.1f} ms")
    print(f"  Min:        {min_ms:.1f} ms")
    print(f"  Max:        {max_ms:.1f} ms")
    print(f"  Std Dev:    {stdev_ms:.1f} ms")
    print("-" * 40)
    print()

    if avg_ms < 100:
        print("VERDICT: Excellent — well under 100ms per request")
    elif avg_ms < 200:
        print("VERDICT: Good — under 200ms per request")
    elif avg_ms < 500:
        print("VERDICT: Acceptable — under 500ms per request")
    else:
        print("VERDICT: Slow — consider optimization if real-time needed")


if __name__ == "__main__":
    # Defaults
    default_image = os.path.join(os.path.dirname(__file__), "test_images", "person_only.jpg")
    image_path = sys.argv[1] if len(sys.argv) > 1 else default_image
    iterations = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    run_benchmark(image_path, iterations)
