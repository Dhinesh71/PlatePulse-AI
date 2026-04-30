import os
import re
import uuid
from datetime import datetime
from pathlib import Path

import cv2
import easyocr
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from werkzeug.utils import secure_filename

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("PLATEVISION_DATA_DIR", ROOT_DIR))
UPLOAD_FOLDER = Path(os.getenv("PLATEVISION_UPLOAD_DIR", DATA_DIR / "uploads"))
REPORTS_FOLDER = Path(os.getenv("PLATEVISION_REPORTS_DIR", DATA_DIR / "reports"))
INSTANCE_FOLDER = Path(os.getenv("PLATEVISION_INSTANCE_DIR", DATA_DIR / "instance"))
MODEL_FOLDER = Path(os.getenv("PLATEVISION_MODEL_DIR", DATA_DIR / "easyocr_models"))

for directory in (UPLOAD_FOLDER, REPORTS_FOLDER, INSTANCE_FOLDER, MODEL_FOLDER):
    directory.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path="")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{(INSTANCE_FOLDER / 'detections.db').as_posix()}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
app.config["JSON_SORT_KEYS"] = False
CORS(app)

db = SQLAlchemy(app)
_reader = None

INDIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")
BLACKLIST = {"MH12AB1234", "DL3CAY0000"}


class Detection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    plate_number = db.Column(db.String(20), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    image_path = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default="Pending", nullable=False)


with app.app_context():
    db.create_all()


def get_ocr_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False, model_storage_dir=str(MODEL_FOLDER))
    return _reader


def normalize_plate_text(text):
    cleaned_text = re.sub(r"[^A-Z0-9]", "", text.upper())
    corrected_text = list(cleaned_text)
    numeric_positions = {2, 3, 6, 7, 8, 9}
    alpha_positions = {0, 1, 4, 5}

    for index, char in enumerate(corrected_text):
        if index in numeric_positions:
            if char == "I":
                corrected_text[index] = "1"
            elif char == "Z":
                corrected_text[index] = "2"
            elif char in {"O", "Q", "D"}:
                corrected_text[index] = "0"
            elif char == "S":
                corrected_text[index] = "5"
            elif char == "B":
                corrected_text[index] = "8"
        elif index in alpha_positions:
            if char == "0":
                corrected_text[index] = "O"
            elif char == "1":
                corrected_text[index] = "I"
            elif char == "2":
                corrected_text[index] = "Z"

    return "".join(corrected_text)


def validate_plate(text):
    normalized_text = re.sub(r"[^A-Z0-9]", "", text.upper())
    if INDIAN_PLATE_PATTERN.match(normalized_text):
        return True, normalized_text, normalized_text in BLACKLIST
    return False, normalized_text, False


def choose_best_detection(detections):
    ranked = sorted(
        detections,
        key=lambda detection: (detection["is_valid"], detection["confidence"]),
        reverse=True,
    )
    return ranked[0]


def prepare_image_for_ocr(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    filtered = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(filtered, 30, 200)

    contour_data = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = contour_data[0] if len(contour_data) == 2 else contour_data[1]
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue

        approximation = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approximation) != 4:
            continue

        mask = np.zeros(gray.shape, np.uint8)
        cv2.drawContours(mask, [approximation], 0, 255, -1)
        points = np.column_stack(np.where(mask == 255))
        if points.size == 0:
            continue

        topx, topy = points.min(axis=0)
        bottomx, bottomy = points.max(axis=0)
        cropped = gray[topx : bottomx + 1, topy : bottomy + 1]
        if cropped.size == 0:
            continue

        _, processed = cv2.threshold(cropped, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return processed

    return gray


def run_plate_ocr(image):
    image_for_ocr = prepare_image_for_ocr(image)
    ocr_results = get_ocr_reader().readtext(image_for_ocr)
    detections = []

    for _, text, probability in ocr_results:
        corrected_text = normalize_plate_text(text)
        if len(corrected_text) <= 4:
            continue

        is_valid, formatted_text, is_blacklisted = validate_plate(corrected_text)
        detections.append(
            {
                "plate": formatted_text if is_valid else corrected_text,
                "confidence": float(probability),
                "is_valid": is_valid,
                "is_blacklisted": is_blacklisted,
            }
        )

    return detections


def build_detection_payload(detection):
    return {
        "id": detection.id,
        "plate": detection.plate_number,
        "confidence": detection.confidence,
        "timestamp": detection.timestamp.isoformat(),
        "status": detection.status,
        "image_path": detection.image_path,
        "image_url": f"/uploads/{detection.image_path}",
    }


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "detections": Detection.query.count(),
            "data_dir": str(DATA_DIR),
        }
    )


@app.route("/detect", methods=["POST"])
def detect_plate():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    uploaded_file = request.files["image"]
    original_name = secure_filename(uploaded_file.filename or "upload.jpg") or "upload.jpg"
    filename = f"{uuid.uuid4().hex}_{original_name}"
    file_path = UPLOAD_FOLDER / filename
    uploaded_file.save(file_path)

    image = cv2.imread(str(file_path))
    if image is None:
        file_path.unlink(missing_ok=True)
        return jsonify({"error": "Failed to read the uploaded image"}), 400

    try:
        detections = run_plate_ocr(image)
    except Exception as exc:
        return jsonify({"error": f"OCR processing failed: {exc}"}), 500

    if not detections:
        return jsonify({"message": "No plate detected", "detections": []}), 200

    best_match = choose_best_detection(detections)
    final_status = (
        "Blacklisted"
        if best_match["is_blacklisted"]
        else ("Valid" if best_match["is_valid"] else "Invalid")
    )

    new_detection = Detection(
        plate_number=best_match["plate"],
        confidence=best_match["confidence"],
        image_path=filename,
        status=final_status,
    )
    db.session.add(new_detection)
    db.session.commit()

    response_payload = build_detection_payload(new_detection)
    response_payload.update(
        {
            "is_valid": best_match["is_valid"],
            "is_blacklisted": best_match["is_blacklisted"],
            "vehicle_type": "Car",
            "vehicle_color": "Unknown",
        }
    )
    return jsonify(response_payload)


@app.route("/report/<int:detection_id>", methods=["POST"])
def generate_report(detection_id):
    detection = Detection.query.get_or_404(detection_id)
    report_filename = f"Report_{detection.plate_number}_{uuid.uuid4().hex[:6]}.pdf"
    report_path = REPORTS_FOLDER / report_filename

    pdf = canvas.Canvas(str(report_path), pagesize=letter)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(100, 750, "PlateVision AI: Detection Report")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(100, 730, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    pdf.drawString(100, 700, f"Detected Plate: {detection.plate_number}")
    pdf.drawString(100, 680, f"Inference Confidence: {detection.confidence:.2f}")
    pdf.drawString(100, 660, f"System Status: {detection.status}")
    pdf.drawString(100, 640, f"Capture Time: {detection.timestamp.isoformat()}")
    pdf.drawString(100, 620, f"Reference Image: {detection.image_path}")
    pdf.save()

    return jsonify(
        {
            "message": "Report generated successfully",
            "report_url": f"/reports/{report_filename}",
        }
    )


@app.route("/detections", methods=["GET"])
def get_detections():
    detections = Detection.query.order_by(Detection.timestamp.desc()).all()
    return jsonify([build_detection_payload(detection) for detection in detections])


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(str(UPLOAD_FOLDER), filename)


@app.route("/reports/<path:filename>")
def serve_report(filename):
    return send_from_directory(str(REPORTS_FOLDER), filename)
