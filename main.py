
# ============================================
# TRANSAI - AI LANGUAGE TRANSLATOR
# FastAPI Backend
# Version: 3.2.1
# ============================================

import os
import re
from pathlib import Path
from io import BytesIO

import requests
import numpy as np
import easyocr

from PIL import Image, UnidentifiedImageError
from langdetect import detect, LangDetectException

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ============================================
# PATH CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent


def find_folder(folder_name):
    """Find folder even if its name has different capitalization."""
    for item in BASE_DIR.iterdir():
        if item.is_dir() and item.name.lower() == folder_name.lower():
            return item
    return BASE_DIR / folder_name


TEMPLATES_DIR = find_folder("templates")
STATIC_DIR = find_folder("static")


# ============================================
# FASTAPI APP
# ============================================

app = FastAPI(
    title="TransAI",
    description="AI Language Translation Application",
    version="3.2.1"
)


# ============================================
# STATIC FILES
# ============================================

if STATIC_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR)),
        name="static"
    )


# ============================================
# SUPPORTED LANGUAGES
# ============================================

LANGUAGES = [
    {"code": "auto", "name": "Auto Detect"},
    {"code": "en", "name": "English"},
    {"code": "hi", "name": "Hindi"},
    {"code": "bn", "name": "Bengali"},
    {"code": "ur", "name": "Urdu"},
    {"code": "fr", "name": "French"},
    {"code": "de", "name": "German"},
    {"code": "es", "name": "Spanish"},
    {"code": "it", "name": "Italian"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "ru", "name": "Russian"},
    {"code": "ja", "name": "Japanese"},
    {"code": "ko", "name": "Korean"},
    {"code": "zh", "name": "Chinese"},
    {"code": "ar", "name": "Arabic"},
    {"code": "tr", "name": "Turkish"},
    {"code": "nl", "name": "Dutch"},
    {"code": "pl", "name": "Polish"},
    {"code": "uk", "name": "Ukrainian"},
    {"code": "sv", "name": "Swedish"},
    {"code": "da", "name": "Danish"},
    {"code": "fi", "name": "Finnish"},
    {"code": "el", "name": "Greek"},
    {"code": "he", "name": "Hebrew"},
    {"code": "th", "name": "Thai"},
    {"code": "vi", "name": "Vietnamese"},
    {"code": "id", "name": "Indonesian"},
    {"code": "ms", "name": "Malay"},
    {"code": "ta", "name": "Tamil"},
    {"code": "te", "name": "Telugu"},
    {"code": "mr", "name": "Marathi"},
    {"code": "gu", "name": "Gujarati"},
    {"code": "pa", "name": "Punjabi"},
    {"code": "ne", "name": "Nepali"},
    {"code": "fa", "name": "Persian"},
    {"code": "ro", "name": "Romanian"},
    {"code": "hu", "name": "Hungarian"},
    {"code": "cs", "name": "Czech"},
]


# ============================================
# LANGUAGE CODE NORMALIZATION
# ============================================

LANGUAGE_ALIASES = {
    "zh-cn": "zh",
    "zh-tw": "zh",
    "zh-cn": "zh",
    "iw": "he",
    "in": "id",
    "jw": "jv",
}


def normalize_language(language):
    if not language:
        return "auto"

    language = language.strip().lower()
    language = LANGUAGE_ALIASES.get(language, language)

    return language.split("-")[0]


# ============================================
# LANGUAGE DETECTION
# ============================================

def detect_source_language(text):
    try:
        detected = detect(text)
        return normalize_language(detected)
    except LangDetectException:
        return "en"
    except Exception:
        return "en"


# ============================================
# REQUEST MODEL
# ============================================

class TranslateRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "hi"


# ============================================
# MYMEMORY TRANSLATION
# ============================================

def mymemory_translate(text, source_language, target_language):

    url = "https://api.mymemory.translated.net/get"

    params = {
        "q": text,
        "langpair": f"{source_language}|{target_language}"
    }

    response = requests.get(
        url,
        params=params,
        timeout=25
    )

    response.raise_for_status()

    data = response.json()

    translated_text = (
        data.get("responseData", {})
        .get("translatedText", "")
    )

    if not translated_text:
        raise ValueError("MyMemory returned an empty translation.")

    if data.get("responseStatus") not in (200, "200", None):
        raise ValueError("MyMemory translation failed.")

    return translated_text


# ============================================
# LIBRETRANSLATE BACKUP
# ============================================

def libre_translate(text, source_language, target_language):

    servers = [
        "https://libretranslate.de/translate",
        "https://translate.argosopentech.com/translate"
    ]

    payload = {
        "q": text,
        "source": source_language,
        "target": target_language,
        "format": "text"
    }

    last_error = None

    for server in servers:
        try:
            response = requests.post(
                server,
                data=payload,
                timeout=20
            )

            response.raise_for_status()

            data = response.json()
            translated_text = data.get("translatedText")

            if translated_text:
                return translated_text

        except Exception as error:
            last_error = error

    raise RuntimeError(
        f"Backup translation service failed: {last_error}"
    )


# ============================================
# MAIN TRANSLATION FUNCTION
# ============================================

def translate_text(text, source_language="auto", target_language="hi"):

    text = (text or "").strip()

    if not text:
        raise ValueError("Please enter some text to translate.")

    if len(text) > 4500:
        raise ValueError("Text is too long. Please enter less than 4500 characters.")

    source_language = normalize_language(source_language)
    target_language = normalize_language(target_language)

    supported_codes = {
        language["code"] for language in LANGUAGES
    }

    if target_language not in supported_codes or target_language == "auto":
        raise ValueError("Please select a valid target language.")

    if source_language == "auto":
        source_language = detect_source_language(text)

    if source_language not in supported_codes or source_language == "auto":
        source_language = "en"

    if source_language == target_language:
        return {
            "translated_text": text,
            "engine": "Same Language",
            "source_language": source_language,
            "target_language": target_language
        }

    errors = []

    # First translation engine
    try:
        translated = mymemory_translate(
            text,
            source_language,
            target_language
        )

        return {
            "translated_text": translated,
            "engine": "MyMemory",
            "source_language": source_language,
            "target_language": target_language
        }

    except Exception as error:
        errors.append(f"MyMemory: {str(error)}")

    # Backup translation engine
    try:
        translated = libre_translate(
            text,
            source_language,
            target_language
        )

        return {
            "translated_text": translated,
            "engine": "LibreTranslate",
            "source_language": source_language,
            "target_language": target_language
        }

    except Exception as error:
        errors.append(f"LibreTranslate: {str(error)}")

    raise RuntimeError(
        "Translation services are temporarily unavailable. "
        + " | ".join(errors)
    )


# ============================================
# OCR READER - LAZY LOADING
# ============================================

ocr_reader = None


def get_ocr_reader():

    global ocr_reader

    if ocr_reader is None:
        ocr_reader = easyocr.Reader(
            ["en"],
            gpu=False
        )

    return ocr_reader


# ============================================
# HOME PAGE
# ============================================

@app.get("/")
async def home():

    index_file = TEMPLATES_DIR / "index.html"

    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="index.html not found. Please check your templates folder."
        )

    return FileResponse(str(index_file))


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/health")
async def health():

    return {
        "status": "healthy",
        "application": "TransAI",
        "version": "3.2.1"
    }


# ============================================
# GET LANGUAGES
# ============================================

@app.get("/languages")
async def get_languages():

    return {
        "success": True,
        "languages": LANGUAGES
    }


# ============================================
# TEXT TRANSLATION API
# ============================================

@app.post("/translate")
async def translate(request: TranslateRequest):

    try:

        result = translate_text(
            request.text,
            request.source_language,
            request.target_language
        )

        return {
            "success": True,
            "original_text": request.text,
            "translated_text": result["translated_text"],
            "source_language": result["source_language"],
            "target_language": result["target_language"],
            "engine": result["engine"]
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:

        raise HTTPException(
            status_code=503,
            detail=str(error)
        )


# ============================================
# IMAGE OCR + TRANSLATION API
# ============================================

@app.post("/translate-image")
async def translate_image(
    file: UploadFile = File(...),
    source_language: str = Form("auto"),
    target_language: str = Form("hi")
):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Please select an image."
        )

    allowed_extensions = {
        ".jpg", ".jpeg", ".png", ".webp", ".bmp"
    }

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format."
        )

    try:

        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image size must be less than 10 MB."
            )

        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError:
            raise HTTPException(
                status_code=400,
                detail="Invalid image file."
            )

        image_array = np.array(image)

        reader = get_ocr_reader()

        extracted_lines = reader.readtext(
            image_array,
            detail=0,
            paragraph=True
        )

        extracted_text = "\n".join(
            line.strip()
            for line in extracted_lines
            if line and line.strip()
        )

        if not extracted_text:
            raise HTTPException(
                status_code=400,
                detail="No readable text found in this image."
            )

        result = translate_text(
            extracted_text,
            source_language,
            target_language
        )

        return {
            "success": True,
            "extracted_text": extracted_text,
            "translated_text": result["translated_text"],
            "source_language": result["source_language"],
            "target_language": result["target_language"],
            "engine": result["engine"]
        }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=f"Image translation failed: {str(error)}"
        )


# ============================================
# STARTUP MESSAGE
# ============================================

@app.on_event("startup")
async def startup_event():

    print("------------------------------------")
    print("       TRANSAI BACKEND STARTED      ")
    print("       Version: 3.2.1               ")
    print("------------------------------------")
