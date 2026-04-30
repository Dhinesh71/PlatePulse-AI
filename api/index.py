import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Serverless deployments can only write in /tmp, so keep that override here.
os.environ.setdefault("PLATEVISION_DATA_DIR", "/tmp/platevision")

from platevision_app import app

app.debug = False
