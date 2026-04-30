# Deployment Plan

## Recommended target

Use Render for the first production deployment of this project.

Why:

- This app writes uploads, PDF reports, EasyOCR models, and a SQLite database to disk.
- Render supports Python web services, health checks, and persistent disks.
- The app can still run in a serverless environment, but that path is best treated as a demo because `/tmp` storage is temporary.

## Included deployment assets

- `render.yaml`: Render Blueprint for a Python web service with a mounted disk.
- `Dockerfile`: Containerized deployment option.
- `.dockerignore`: Keeps image builds smaller and cleaner.

## Render deployment steps

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

## Post-deploy validation

1. Open `/health` and confirm it returns HTTP 200.
2. Open the site root and confirm the dashboard loads.
3. Upload a test image and confirm:
   - a detection row is created
   - the uploaded image loads in history
   - a PDF report downloads correctly
4. Redeploy once and confirm previous history still exists.

## Operational notes

- EasyOCR may increase cold-start time on the first detection request because the model must be present on disk.
- SQLite plus a single mounted disk means this service should stay on one instance.
- If usage grows, the best next upgrade is moving history to Postgres and object files to cloud storage.

## Next production improvements

1. Move detection history from SQLite to Postgres.
2. Move uploads and reports from local disk to object storage.
3. Add authentication before exposing the dashboard publicly.
4. Add automated backend smoke tests once Python CI is configured in the repo.
