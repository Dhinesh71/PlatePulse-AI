# PlateVision AI

PlateVision AI is a Flask-based vehicle number plate detection app with an OCR pipeline powered by EasyOCR and OpenCV. It includes a dashboard UI, SQLite-backed detection history, uploaded image storage, and downloadable PDF reports.

## What was fixed

- Unified the duplicated backend logic into a single shared app module so local runs and deployment use the same behavior.
- Fixed the frontend API base logic so the UI works both when opened from `file://` locally and when served from the same deployed domain.
- Added safer backend bootstrapping for a fresh environment by creating required folders before database or upload work starts.
- Fixed a backend crash path for unreadable uploads and improved OCR selection so valid plate matches are preferred over high-confidence invalid strings.
- Returned `is_blacklisted` in the API response so the UI badge logic matches the backend response shape.
- Removed the broken video-upload promise from the UI because the backend only supports image inference right now.
- Added missing badge styles, search filtering, live chart updates, and better request error handling in the dashboard.

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

- `PORT`: HTTP port. Defaults to `5000`.
- `FLASK_DEBUG`: Set to `1` or `true` for debug mode.
- `PLATEVISION_DATA_DIR`: Base directory for the SQLite DB, OCR models, uploads, and reports.
- `PLATEVISION_UPLOAD_DIR`: Optional override for uploads only.
- `PLATEVISION_REPORTS_DIR`: Optional override for reports only.
- `PLATEVISION_INSTANCE_DIR`: Optional override for the SQLite DB folder.
- `PLATEVISION_MODEL_DIR`: Optional override for EasyOCR model storage.

## Deployment

The repository now includes:

- `render.yaml` for a Render deployment with a persistent disk.
- `Dockerfile` and `.dockerignore` for container-based hosting.
- `DEPLOYMENT.md` with a step-by-step deployment plan and validation checklist.

If you want a stateful production deployment, use Render or another container host with persistent storage. The existing `api/index.py` serverless entry can still be used for Vercel-style experiments, but it writes to `/tmp`, so history and generated files are not durable there.
