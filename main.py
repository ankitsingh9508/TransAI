
# ============================================
# TRANSAI - AI LANGUAGE TRANSLATOR
# FastAPI Backend
# Version: 3.3
# ============================================

import os
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
from pydantic import BaseModel, Field


# ============================================
# PATH CONFIGURATION
# ============================================

BASE_DIR = Path(__file__).resolve().parent


def find_folder(folder_name):
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
    version="3.3"
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

SUPPORTED_CODES = {
    item["code"] for item in LANGUAGES
    if item["code"] != "auto"
}


# ============================================
# LANGUAGE NORMALIZATION
# ============================================

LANGUAGE_ALIASES = {
    "zh-cn": "zh",
    "zh-tw": "zh",
    "zh-hans": "zh",
    "zh-hant": "zh",
    "iw": "he",
    "in": "id",
    "jw": "jv",
}


def normalize_language(language):
    if not language:
        return "auto"

    language = str(language).strip().lower()
    language = LANGUAGE_ALIASES.get(language, language)

    return language.split("-")[0]


def provider_language_code(language):
    # MyMemory commonly uses zh-CN for Chinese.
    if language == "zh":
        return "zh-CN"
    return language


# ============================================
# LANGUAGE DETECTION
# ============================================

def detect_source_language(text):
    try:
        detected = normalize_language(detect(text))

        if detected in SUPPORTED_CODES:
            return detected

        return "en"

    except (LangDetectException, Exception):
        return "en"


# ============================================
# REQUEST MODEL
# ============================================

class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4500)
    source_language: str = "auto"
    target_language: str = "hi"


# ============================================
# TEXT CHUNKING
# ============================================

def split_text(text, max_length=450):
    """
    Split long text into smaller chunks.
    MyMemory has practical query-length limitations.
    """

    words = text.split()
    chunks = []
    current = ""

    for word in words:
        if len(word) > max_length:
            if current:
                chunks.append(current)
                current = ""

            for start in range(0, len(word), max_length):
                chunks.append(word[start:start + max_length])

            continue

        candidate = f"{current} {word}".strip()

        if len(candidate) <= max_length:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = word

    if current:
        chunks.append(current)

    return chunks


# ============================================
# MYMEMORY TRANSLATION
# ============================================

def mymemory_translate(text, source_language, target_language):

    url = "https://api.mymemory.translated.net/get"

    source_code = provider_language_code(source_language)
    target_code = provider_language_code(target_language)

    chunks = split_text(text)
    translated_chunks = []

    for chunk in chunks:

        response = requests.get(
            url,
            params={
                "q": chunk,
                "langpair": f"{source_code}|{target_code}"
            },
            timeout=25
        )

        response.raise_for_status()

        data = response.json()

        if data.get("responseStatus") not in (200, "200", None):
            raise RuntimeError(
                data.get("responseDetails", "MyMemory translation failed.")
            )

        translated = (
            data.get("responseData", {})
            .get("translatedText", "")
        )

        if not translated:
            raise RuntimeError("MyMemory returned an empty translation.")

        translated_chunks.append(translated)

    return " ".join(translated_chunks)


# ============================================
# LIBRETRANSLATE BACKUP
# ============================================

def libre_translate(text, source_language, target_language):

    servers = [
        "https://libretranslate.de/translate",
        "https://translate.argosopentech.com/translate"
    ]

    last_error = None

    for server in servers:
        try:
            response = requests.post(
                server,
                data={
                    "q": text,
                    "source": source_language,
                    "target": target_language,
                    "format": "text"
                },
                timeout=25
            )

            response.raise_for_status()

            data = response.json()
            translated = data.get("translatedText")

            if translated and isinstance(translated, str):
                return translated

            last_error = "Empty translation received."

        except Exception as error:
            last_error = str(error)

    raise RuntimeError(
        f"Backup translation service failed: {last_error}"
    )


# ============================================
# MAIN TRANSLATION FUNCTION
# ============================================

def translate_text(
    text,
    source_language="auto",
    target_language="hi"
):

    text = (text or "").strip()

    if not text:
        raise ValueError("Please enter some text to translate.")

    if len(text) > 4500:
        raise ValueError("Text must be 4500 characters or less.")

    requested_source = normalize_language(source_language)
    target_language = normalize_language(target_language)

    if target_language not in SUPPORTED_CODES:
        raise ValueError("Please select a valid target language.")

    if requested_source == "auto":
        source_language = detect_source_language(text)
    else:
        if requested_source not in SUPPORTED_CODES:
            raise ValueError("Please select a valid source language.")
        source_language = requested_source

    if source_language == target_language:
        return {
            "translated_text": text,
            "engine": "Same Language",
            "source_language": source_language,
            "target_language": target_language
        }

    errors = []

    # Primary translation service
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

    # Backup translation service
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
        "Please try again later."
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

    if not index_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="index.html not found. Check your templates folder."
        )

    return FileResponse(
        str(index_file),
        media_type="text/html"
    )


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/health")
async def health():

    return {
        "success": True,
        "status": "healthy",
        "application": "TransAI",
        "version": "3.3"
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

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Translation service is temporarily unavailable. Please try again."
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
            image = Image.open(BytesIO(image_bytes))
            image.verify()

            image = Image.open(BytesIO(image_bytes)).convert("RGB")

        except (UnidentifiedImageError, OSError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Invalid or corrupted image file."
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
            if isinstance(line, str) and line.strip()
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

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Image translation failed. Please try another image."
        )

    finally:
        await file.close()


# ============================================
# STARTUP MESSAGE
# ============================================

@app.on_event("startup")
async def startup_event():

    print("------------------------------------")
    print("       TRANSAI BACKEND STARTED      ")
    print("       Version: 3.3                ")
    print("------------------------------------")
