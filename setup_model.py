import urllib.request
import os

CFG_URL = "https://raw.githubusercontent.com/AlexeyAB/darknet/master/cfg/yolov4-tiny.cfg"
WEIGHTS_URL = "https://github.com/AlexeyAB/darknet/releases/download/darknet_yolo_v4_pre/yolov4-tiny.weights"
NAMES_URL = "https://raw.githubusercontent.com/AlexeyAB/darknet/master/data/coco.names"

os.makedirs("models", exist_ok=True)

cfg_path = os.path.join("models", "yolov4-tiny.cfg")
weights_path = os.path.join("models", "yolov4-tiny.weights")
names_path = os.path.join("models", "coco.names")

def download_file(url, target_path):
    if not os.path.exists(target_path):
        print(f"Downloading {target_path}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(target_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Downloaded {target_path}")
    else:
        print(f"{target_path} already exists.")

if __name__ == "__main__":
    download_file(CFG_URL, cfg_path)
    download_file(NAMES_URL, names_path)
    download_file(WEIGHTS_URL, weights_path)
