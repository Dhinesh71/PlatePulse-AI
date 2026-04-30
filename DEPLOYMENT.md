# Deployment Guide

## Best use of each platform

- Hugging Face Spaces: best free demo deployment for this project
- Render: better production-style deployment once you are ready to pay for persistent disk

This repo is now configured to run on Hugging Face Spaces as a Docker Space.

## Hugging Face Spaces deployment

### Recommended setup

1. Create a new Space on Hugging Face.
2. Choose `Docker` as the SDK.
3. Push this repository to the Space.
4. Let the Space build automatically.

The required metadata is already in `README.md`, including:

- `sdk: docker`
- `app_port: 7860`

### Free deployment path

Use these settings:

- Hardware: `CPU Basic`
- Storage: none, if you only need a demo

What to expect:

- The app will run as a demo and wake up when someone opens it after sleep.
- Uploaded images, generated PDF reports, SQLite history, and OCR cache may be lost on restart or rebuild because free storage is ephemeral.

### Better Hugging Face setup

If you want data to survive restarts:

1. Open the Space settings.
2. Attach a writable storage mount.
3. Mount it at `/data`.

The app is already coded to use:

- `/data/platevision` when `/data` is available
- `/tmp/platevision` on Spaces without attached storage

### Post-deploy checks

1. Open the Space URL and confirm the dashboard loads.
2. Upload a test vehicle image.
3. Confirm a detection appears in history.
4. Generate a PDF report and verify it opens.
5. If using attached storage, restart the Space and confirm history remains.

## Render deployment

### Recommended setup

1. Push this project to GitHub, GitLab, or Bitbucket.
2. In Render, create a new Blueprint or Web Service from the repo.
3. If you use the included `render.yaml`, Render will prefill the service definition.
4. Confirm the service settings:
   - Runtime: Python
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn backend.app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 300`
   - Health check path: `/health`
5. Keep the persistent disk mounted at `/var/data`.
6. Set `PLATEVISION_DATA_DIR=/var/data`.
7. Deploy and wait for the first build to complete.

### Post-deploy validation

1. Open `/health` and confirm it returns HTTP 200.
2. Open the site root and confirm the dashboard loads.
3. Upload a test image and confirm:
   - a detection row is created
   - the uploaded image loads in history
   - a PDF report downloads correctly
4. Redeploy once and confirm previous history still exists.

## Operational notes

- EasyOCR may increase cold-start time on the first detection request because the model must be present on disk.
- SQLite plus local file storage is acceptable for a demo but not ideal for a larger production app.
- If usage grows, the best next upgrade is moving history to Postgres and object files to cloud storage.
