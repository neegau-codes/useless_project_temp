# AYN NEE ETHA CV API

This is the Computer Vision backend for the AYN NEE ETHA camera application.
It exposes a simple API that accepts an image and identifies the "Main Character" and the "Anti-Main Character" based on a Main Character Energy™ (MCE) score.

## Stack

- **Framework**: FastAPI
- **Inference**: OpenCV DNN
- **Model**: SSD MobileNet v1 (ONNX)
- **Labels**: COCO 80 categories

## Installation

1. Create a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\Activate.ps1
   # On Mac/Linux:
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Download the ONNX model (if not already present):
   ```bash
   python download_onnx.py
   ```

## Running the API locally

Run the FastAPI server using Uvicorn:
```bash
python main.py
# Or using uvicorn directly:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.
Swagger docs at `http://localhost:8000/docs`.

## Endpoints

### `GET /health`
Returns a simple status indicating whether the API is running and the model is loaded.

### `POST /analyze`
Accepts a multipart/form-data request with a `file` field containing an image.

**Example Request:**
```bash
curl -X POST -F "file=@test.jpg" http://localhost:8000/analyze
```

**Response Format:**
```json
{
  "image_width": 1280,
  "image_height": 720,
  "detections": [
    {
      "label": "person",
      "confidence": 0.94,
      "bbox": [120, 80, 400, 500],
      "normalized_bbox": [0.094, 0.111, 0.313, 0.694],
      "mce_score": 94,
      "mce_components": {
        "person_bonus": 50,
        "size_score": 27,
        "center_score": 17
      }
    }
  ],
  "main_character": { ... },
  "anti_main_character": { ... }
}
```

## MCE Scoring

| Component | Range | Description |
|-----------|-------|-------------|
| Person Bonus | 0 or 50 | 50 if the detection is a person |
| Size Score | 0–30 | Based on detection area relative to image |
| Center Score | 0–20 | Rewards proximity to image center |
| **Total MCE** | **0–100** | Sum, capped at 100 |

## Testing

### Automated Test Suite
```bash
python -m pytest test_cv_pipeline.py -v
```

### Debug / Diagnostic Tool
```bash
# Direct inference (no server needed):
python test_analyze.py test_images/person_only.jpg

# Process all test images:
python test_analyze.py test_images/

# Via running API server:
python test_analyze.py test_images/person_only.jpg --api
```

### Performance Benchmark
```bash
python benchmark.py
python benchmark.py test_images/multiple_people.jpg 20
```

### Legacy Test Script
```bash
python test_api.py
```
