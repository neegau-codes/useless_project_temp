import urllib.request
import os

urls = [
    "https://github.com/onnx/models/raw/main/validated/vision/object_detection_segmentation/ssd-mobilenetv1/model/ssd_mobilenet_v1_10.onnx",
    "https://raw.githubusercontent.com/amikelive/coco-labels/master/coco-labels-2014_2017.txt"
]

os.makedirs("models", exist_ok=True)

for url in urls:
    filename = url.split("/")[-1]
    target_path = os.path.join("models", filename)
    print(f"Downloading {filename}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(target_path, 'wb') as out_file:
        out_file.write(response.read())
    print(f"Downloaded {target_path}")
