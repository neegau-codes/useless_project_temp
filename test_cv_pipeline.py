"""
AYN NEE ETHA — Comprehensive CV Pipeline Test Suite

Run with: python -m pytest test_cv_pipeline.py -v

Tests cover:
  - API schema / contract compliance
  - MCE scoring ranges and determinism
  - Ranking logic (main/anti-main character)
  - Detection filtering
  - Normalized bounding box validation
  - Error handling (empty file, text file, corrupted data)
  - Multiple image resolutions
  - Edge cases (tiny image, no detections)
"""
import os
import io
import json
import warnings
import numpy as np
from PIL import Image

import pytest
from fastapi.testclient import TestClient

warnings.filterwarnings("ignore")

from main import app

client = TestClient(app)

TEST_IMAGES_DIR = os.path.join(os.path.dirname(__file__), "test_images")

# ─── Helpers ───────────────────────────────────────────────────

def make_solid_image_bytes(width=640, height=480, color=(128, 128, 128), fmt="JPEG"):
    """Generate a solid-color image as bytes (no external files needed)."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf.read()


def post_image_bytes(data: bytes, filename="test.jpg", content_type="image/jpeg"):
    """POST raw bytes to /analyze."""
    return client.post("/analyze", files={"file": (filename, data, content_type)})


def post_image_file(path: str):
    """POST a file from disk to /analyze."""
    with open(path, "rb") as f:
        return client.post("/analyze", files={"file": (os.path.basename(path), f, "image/jpeg")})


REQUIRED_TOP_KEYS = {"image_width", "image_height", "detections", "main_character", "anti_main_character"}
REQUIRED_DETECTION_KEYS = {"label", "confidence", "bbox", "normalized_bbox", "mce_score", "mce_components"}
REQUIRED_MCE_KEYS = {"person_bonus", "size_score", "center_score"}


def assert_valid_response_schema(data: dict):
    """Validate the full response schema matches the API contract."""
    for key in REQUIRED_TOP_KEYS:
        assert key in data, f"Missing top-level key: {key}"

    for det in data["detections"]:
        for key in REQUIRED_DETECTION_KEYS:
            assert key in det, f"Missing detection key: {key}"
        for key in REQUIRED_MCE_KEYS:
            assert key in det["mce_components"], f"Missing mce_components key: {key}"


# ═══════════════════════════════════════════════════════════════
# 1. HEALTH ENDPOINT
# ═══════════════════════════════════════════════════════════════

class TestHealth:
    def test_health_returns_200(self):
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_model_loaded(self):
        res = client.get("/health")
        data = res.json()
        assert data["status"] == "ok"
        assert data["model_loaded"] is True

    def test_health_engine_name(self):
        res = client.get("/health")
        assert "SSD MobileNet" in res.json()["engine"]


# ═══════════════════════════════════════════════════════════════
# 2. RESPONSE SCHEMA / API CONTRACT
# ═══════════════════════════════════════════════════════════════

class TestResponseSchema:
    def test_top_level_keys(self):
        data = make_solid_image_bytes()
        res = post_image_bytes(data)
        assert res.status_code == 200
        body = res.json()
        for key in REQUIRED_TOP_KEYS:
            assert key in body

    def test_image_dimensions_match(self):
        data = make_solid_image_bytes(width=800, height=600)
        res = post_image_bytes(data)
        body = res.json()
        assert body["image_width"] == 800
        assert body["image_height"] == 600

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "person_only.jpg")),
        reason="Test image not available"
    )
    def test_detection_schema_with_real_image(self):
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "person_only.jpg"))
        assert res.status_code == 200
        assert_valid_response_schema(res.json())


# ═══════════════════════════════════════════════════════════════
# 3. MCE SCORING VALIDATION
# ═══════════════════════════════════════════════════════════════

class TestMCEScoring:
    """Validate MCE score components are within spec ranges."""

    @pytest.fixture(autouse=True)
    def _load_test_images(self):
        self.test_images = []
        if os.path.isdir(TEST_IMAGES_DIR):
            for fname in os.listdir(TEST_IMAGES_DIR):
                if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    self.test_images.append(os.path.join(TEST_IMAGES_DIR, fname))

    def _get_all_detections(self):
        """Collect detections from all available test images."""
        all_dets = []
        for img_path in self.test_images:
            res = post_image_file(img_path)
            if res.status_code == 200:
                all_dets.extend(res.json().get("detections", []))
        return all_dets

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_mce_total_range(self):
        """Every MCE score must be in [0, 100]."""
        for det in self._get_all_detections():
            assert 0 <= det["mce_score"] <= 100, f"MCE {det['mce_score']} out of range"

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_person_bonus_values(self):
        """Person bonus must be exactly 0 or 50."""
        for det in self._get_all_detections():
            pb = det["mce_components"]["person_bonus"]
            assert pb in (0, 50), f"person_bonus={pb} not in {{0, 50}}"
            if det["label"] == "person":
                assert pb == 50
            else:
                assert pb == 0

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_size_score_range(self):
        """Size score must be in [0, 30]."""
        for det in self._get_all_detections():
            ss = det["mce_components"]["size_score"]
            assert 0 <= ss <= 30, f"size_score={ss} out of range"

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_center_score_range(self):
        """Center score must be in [0, 20]."""
        for det in self._get_all_detections():
            cs = det["mce_components"]["center_score"]
            assert 0 <= cs <= 20, f"center_score={cs} out of range"

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_components_sum_to_total(self):
        """person_bonus + size_score + center_score should equal mce_score (capped at 100)."""
        for det in self._get_all_detections():
            comp = det["mce_components"]
            expected = min(100, comp["person_bonus"] + comp["size_score"] + comp["center_score"])
            assert det["mce_score"] == expected, (
                f"MCE mismatch: {det['mce_score']} != {expected} "
                f"({comp['person_bonus']}+{comp['size_score']}+{comp['center_score']})"
            )


# ═══════════════════════════════════════════════════════════════
# 4. RANKING LOGIC
# ═══════════════════════════════════════════════════════════════

class TestRanking:

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "person_only.jpg")),
        reason="Test image not available"
    )
    def test_single_person_scene(self):
        """Single person: main_character present, anti_main_character may be null."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "person_only.jpg"))
        data = res.json()
        assert data["main_character"] is not None
        # Single detection → anti should be null
        if len(data["detections"]) == 1:
            assert data["anti_main_character"] is None

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg")),
        reason="Test image not available"
    )
    def test_multiple_people_scene(self):
        """Multiple people: both main and anti should be populated."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg"))
        data = res.json()
        if len(data["detections"]) > 1:
            assert data["main_character"] is not None
            assert data["anti_main_character"] is not None

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg")),
        reason="Test image not available"
    )
    def test_main_has_highest_mce(self):
        """main_character must have the highest MCE score among all detections."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg"))
        data = res.json()
        if data["main_character"] and data["detections"]:
            main_score = data["main_character"]["mce_score"]
            for det in data["detections"]:
                assert main_score >= det["mce_score"]

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg")),
        reason="Test image not available"
    )
    def test_anti_has_lowest_mce(self):
        """anti_main_character must have the lowest MCE score among all detections."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "multiple_people.jpg"))
        data = res.json()
        if data["anti_main_character"] and data["detections"]:
            anti_score = data["anti_main_character"]["mce_score"]
            for det in data["detections"]:
                assert anti_score <= det["mce_score"]

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "object_only.jpg")),
        reason="Test image not available"
    )
    def test_object_only_scene(self):
        """Object-only scene: should work without any person detected."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "object_only.jpg"))
        data = res.json()
        assert res.status_code == 200
        assert_valid_response_schema(data)
        # No person requirement — objects can be main character
        if data["detections"]:
            assert data["main_character"] is not None

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "person_objects.jpg")),
        reason="Test image not available"
    )
    def test_person_objects_scene(self):
        """Person + objects: person should get MCE bonus over objects."""
        res = post_image_file(os.path.join(TEST_IMAGES_DIR, "person_objects.jpg"))
        data = res.json()
        assert res.status_code == 200
        if data["detections"]:
            persons = [d for d in data["detections"] if d["label"] == "person"]
            objects = [d for d in data["detections"] if d["label"] != "person"]
            if persons and objects:
                # At least one person should have bonus
                assert any(d["mce_components"]["person_bonus"] == 50 for d in persons)
                assert all(d["mce_components"]["person_bonus"] == 0 for d in objects)

    def test_no_detections_scene(self):
        """Solid color image → likely no detections → should not crash."""
        data = make_solid_image_bytes(640, 480, color=(50, 50, 50))
        res = post_image_bytes(data)
        assert res.status_code == 200
        body = res.json()
        assert_valid_response_schema(body)
        # If no detections, both should be null
        if len(body["detections"]) == 0:
            assert body["main_character"] is None
            assert body["anti_main_character"] is None


# ═══════════════════════════════════════════════════════════════
# 5. NORMALIZED BOUNDING BOXES
# ═══════════════════════════════════════════════════════════════

class TestNormalizedBbox:

    def _get_detections_from_all_images(self):
        all_dets = []
        if os.path.isdir(TEST_IMAGES_DIR):
            for fname in os.listdir(TEST_IMAGES_DIR):
                if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    res = post_image_file(os.path.join(TEST_IMAGES_DIR, fname))
                    if res.status_code == 200:
                        all_dets.extend(res.json().get("detections", []))
        return all_dets

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_normalized_values_in_range(self):
        """All normalized bbox values must be in [0, 1]."""
        for det in self._get_detections_from_all_images():
            nbbox = det["normalized_bbox"]
            assert len(nbbox) == 4, f"normalized_bbox should have 4 elements, got {len(nbbox)}"
            for i, val in enumerate(nbbox):
                assert 0.0 <= val <= 1.0, (
                    f"normalized_bbox[{i}]={val} out of [0,1] for {det['label']}"
                )

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_bbox_has_four_elements(self):
        """Both bbox and normalized_bbox should have exactly 4 elements."""
        for det in self._get_detections_from_all_images():
            assert len(det["bbox"]) == 4
            assert len(det["normalized_bbox"]) == 4


# ═══════════════════════════════════════════════════════════════
# 6. ERROR HANDLING
# ═══════════════════════════════════════════════════════════════

class TestErrorHandling:

    def test_no_file_uploaded(self):
        """POST with no file → 422 (FastAPI validation)."""
        res = client.post("/analyze")
        assert res.status_code == 422

    def test_empty_file(self):
        """POST with empty file → 400."""
        res = client.post("/analyze", files={"file": ("empty.jpg", io.BytesIO(b""), "image/jpeg")})
        assert res.status_code == 400
        assert "empty" in res.json()["detail"].lower()

    def test_text_file_as_image(self):
        """POST a text file pretending to be an image → 400."""
        text_content = b"This is not an image, it is a text file.\nLine 2.\n"
        res = client.post("/analyze", files={"file": ("fake.jpg", io.BytesIO(text_content), "image/jpeg")})
        assert res.status_code == 400
        assert "invalid" in res.json()["detail"].lower() or "decode" in res.json()["detail"].lower()

    def test_corrupted_image(self):
        """POST random bytes → 400."""
        import random
        random.seed(42)
        garbage = bytes(random.randint(0, 255) for _ in range(1024))
        res = client.post("/analyze", files={"file": ("corrupt.jpg", io.BytesIO(garbage), "image/jpeg")})
        assert res.status_code == 400

    def test_error_does_not_expose_traceback(self):
        """Error responses should not contain Python tracebacks."""
        text_content = b"not an image"
        res = client.post("/analyze", files={"file": ("bad.jpg", io.BytesIO(text_content), "image/jpeg")})
        body = res.text
        assert "Traceback" not in body
        assert "File \"" not in body


# ═══════════════════════════════════════════════════════════════
# 7. DIFFERENT IMAGE RESOLUTIONS
# ═══════════════════════════════════════════════════════════════

class TestResolutions:

    @pytest.mark.parametrize("width,height", [
        (640, 480),
        (1920, 1080),
        (300, 300),
        (4000, 3000),
        (100, 100),
    ])
    def test_various_resolutions(self, width, height):
        """API should handle various image resolutions without crashing."""
        data = make_solid_image_bytes(width, height)
        res = post_image_bytes(data)
        assert res.status_code == 200
        body = res.json()
        assert body["image_width"] == width
        assert body["image_height"] == height

    def test_tiny_image(self):
        """10x10 image should not crash."""
        data = make_solid_image_bytes(10, 10)
        res = post_image_bytes(data)
        assert res.status_code == 200

    def test_wide_panorama(self):
        """Very wide image (panorama-like) should work."""
        data = make_solid_image_bytes(3000, 500)
        res = post_image_bytes(data)
        assert res.status_code == 200

    def test_tall_portrait(self):
        """Very tall image should work."""
        data = make_solid_image_bytes(500, 3000)
        res = post_image_bytes(data)
        assert res.status_code == 200


# ═══════════════════════════════════════════════════════════════
# 8. DETERMINISM
# ═══════════════════════════════════════════════════════════════

class TestDeterminism:

    @pytest.mark.skipif(
        not os.path.exists(os.path.join(TEST_IMAGES_DIR, "person_only.jpg")),
        reason="Test image not available"
    )
    def test_same_image_same_results(self):
        """Running the same image twice must produce identical results."""
        img_path = os.path.join(TEST_IMAGES_DIR, "person_only.jpg")
        res1 = post_image_file(img_path)
        res2 = post_image_file(img_path)
        assert res1.json() == res2.json()


# ═══════════════════════════════════════════════════════════════
# 9. DETECTION FILTERING
# ═══════════════════════════════════════════════════════════════

class TestFiltering:

    @pytest.mark.skipif(
        not os.path.isdir(os.path.join(os.path.dirname(__file__), "test_images")),
        reason="test_images directory not available"
    )
    def test_no_zero_confidence_detections(self):
        """No detection should have confidence below threshold."""
        if os.path.isdir(TEST_IMAGES_DIR):
            for fname in os.listdir(TEST_IMAGES_DIR):
                if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    res = post_image_file(os.path.join(TEST_IMAGES_DIR, fname))
                    if res.status_code == 200:
                        for det in res.json().get("detections", []):
                            assert det["confidence"] >= 0.40, (
                                f"Detection below threshold: {det['confidence']}"
                            )

    def test_detections_sorted_by_mce_descending(self):
        """Detections list must be sorted by MCE score in descending order."""
        if os.path.isdir(TEST_IMAGES_DIR):
            for fname in os.listdir(TEST_IMAGES_DIR):
                if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    res = post_image_file(os.path.join(TEST_IMAGES_DIR, fname))
                    if res.status_code == 200:
                        dets = res.json().get("detections", [])
                        scores = [d["mce_score"] for d in dets]
                        assert scores == sorted(scores, reverse=True), (
                            f"Detections not sorted descending: {scores}"
                        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
