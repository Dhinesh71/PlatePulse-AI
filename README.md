---
title: PlateVision AI
emoji:
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: OCR-based vehicle number plate detection with Flask, EasyOCR, and OpenCV.
---

# PlateVision AI

PlateVision AI is a Flask-based vehicle number plate detection app with an OCR pipeline powered by EasyOCR and OpenCV. It includes a dashboard UI, SQLite-backed detection history, uploaded image storage, and downloadable PDF reports.

## Hugging Face Spaces

This repository is now ready for deployment on Hugging Face Spaces as a `Docker Space`.

What is already configured:

- The `README.md` includes the required Space metadata with `sdk: docker`.
- The `Dockerfile` now serves the app on port `7860`, which matches the Space configuration.
- The app auto-selects its writable data directory:
  - `/data/platevision` if a Hugging Face storage mount is available
  - `/tmp/platevision` on free Spaces without attached storage
  - the local project directory for normal local development

Recommended Space settings:

- SDK: `Docker`
- Hardware: `CPU Basic` for the free demo path
- Storage: optional, but strongly recommended if you want detection history, uploads, reports, and OCR files to survive restarts

Important note for free Spaces:

- Without attached storage, your SQLite DB, uploaded files, generated reports, and OCR cache can be lost when the Space restarts or is rebuilt.

## What was fixed

- Unified the duplicated backend logic into a single shared app module so local runs and deployment use the same behavior.
- Fixed the frontend API base logic so the UI works both when opened from `file://` locally and when served from the same deployed domain.
- Added safer backend bootstrapping for a fresh environment by creating required folders before database or upload work starts.
- Fixed a backend crash path for unreadable uploads and improved OCR selection so valid plate matches are preferred over high-confidence invalid strings.
- Returned `is_blacklisted` in the API response so the UI badge logic matches the backend response shape.
- Removed the broken video-upload promise from the UI because the backend only supports image inference right now.
- Added missing badge styles, search filtering, live chart updates, and better request error handling in the dashboard.
- Adjusted Docker and runtime defaults so Hugging Face Spaces uses the correct port and can use attached storage correctly.

## Local setup

1. Install Python 3.10+.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the app:

```bash
python backend/app.py
```

4. Open:

```text
http://localhost:5000
```

Notes:

- The first OCR request may take longer because EasyOCR downloads models on first use.
- Local data is stored in `instance/`, `uploads/`, `reports/`, and `easyocr_models/` unless you override `PLATEVISION_DATA_DIR`.

## Environment variables

- `PORT`: HTTP port. Defaults to `5000` locally and `7860` in the Docker image.
- `FLASK_DEBUG`: Set to `1` or `true` for debug mode.
- `PLATEVISION_DATA_DIR`: Base directory for the SQLite DB, OCR models, uploads, and reports.
- `PLATEVISION_UPLOAD_DIR`: Optional override for uploads only.
- `PLATEVISION_REPORTS_DIR`: Optional override for reports only.
- `PLATEVISION_INSTANCE_DIR`: Optional override for the SQLite DB folder.
- `PLATEVISION_MODEL_DIR`: Optional override for EasyOCR model storage.

## Deployment

The repository now includes:

- `Dockerfile` and `.dockerignore` for Hugging Face Spaces and other container-based hosting
- `render.yaml` for a Render deployment with a persistent disk
- `DEPLOYMENT.md` with both Hugging Face and Render deployment notes

If you want the easiest free public demo, use Hugging Face Spaces. If you want a more production-style stateful deployment, Render is still the better host.
