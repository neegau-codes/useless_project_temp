import urllib.request
import os

images = {
    "person_objects.jpg": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    "multiple_people.jpg": "https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    "person_only.jpg": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    "object_only.jpg": "https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
    "crowded.jpg": "https://images.unsplash.com/photo-1506869640319-baa1a2881011?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
}

os.makedirs("test_images", exist_ok=True)

for filename, url in images.items():
    path = os.path.join("test_images", filename)
    if not os.path.exists(path):
        print(f"Downloading {filename}...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(path, 'wb') as out_file:
                out_file.write(response.read())
            print(f"Saved to {path}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
    else:
        print(f"{filename} already exists.")
