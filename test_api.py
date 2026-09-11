import os
import sys
import json
import glob
import warnings

warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    print("--- TESTING GET /health ---", flush=True)
    res = client.get("/health")
    print(f"Status Code: {res.status_code}", flush=True)
    print(f"Response: {json.dumps(res.json(), indent=2)}\n", flush=True)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["model_loaded"] is True

def test_image(img_path):
    print(f"--- TESTING POST /analyze WITH: {os.path.basename(img_path)} ---", flush=True)
    with open(img_path, "rb") as f:
        res = client.post("/analyze", files={"file": (os.path.basename(img_path), f, "image/jpeg")})
        
    print(f"Status Code: {res.status_code}", flush=True)
    data = res.json()
    print(json.dumps(data, indent=2), flush=True)
    
    # Assert schema requirements
    assert "image_width" in data
    assert "image_height" in data
    assert "detections" in data
    assert "main_character" in data
    assert "anti_main_character" in data
    
    for det in data["detections"]:
        assert "label" in det
        assert "confidence" in det
        assert "bbox" in det
        assert "normalized_bbox" in det
        assert "mce_score" in det
        assert "mce_components" in det
        assert "person_bonus" in det["mce_components"]
        assert "size_score" in det["mce_components"]
        assert "center_score" in det["mce_components"]
        
    print(f"-> Detections count: {len(data['detections'])}", flush=True)
    if data['main_character']:
        print(f"-> MAIN CHARACTER: {data['main_character']['label']} (MCE: {data['main_character']['mce_score']})", flush=True)
    if data['anti_main_character']:
        print(f"-> ANTI-MAIN CHARACTER: {data['anti_main_character']['label']} (MCE: {data['anti_main_character']['mce_score']})", flush=True)
    print("\n" + "="*60 + "\n", flush=True)

if __name__ == "__main__":
    test_health()
    images = glob.glob("test_images/*.jpg")
    for img in sorted(images):
        test_image(img)
