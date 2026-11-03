
import html
import logging
import os
from io import BytesIO
from pathlib import Path

import requests
from langdetect import detect, LangDetectException

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ==========================================
# TRANSAI CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

APP_VERSION = "4.0"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TransAI")


app = FastAPI(
    title="TransAI",
    description="AI Language Translation Tool",
    version=APP_VERSION
)


# ==========================================
# STATIC FILES
# ==========================================

if STATIC_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR)),
        name="static"
    )


# ==========================================
# SUPPORTED LANGUAGES
# ==========================================

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
    {"code": "zh-CN", "name": "Chinese"},
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
    {"code": "cs", "name": "Czech"}
]

SUPPORTED_CODES = {
    item["code"] for item in LANGUAGES
    if item["code"] != "auto"
}


LANGUAGE_ALIASES = {
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "iw": "he",
    "in": "id",
    "tl": "id"
}


# ==========================================
# REQUEST MODEL
# ==========================================

class TranslateRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "hi"


# ==========================================
# LANGUAGE HELPERS
# ==========================================

def normalize_language(code: str) -> str:
    code = (code or "").strip()

    if not code:
        return "auto"

    alias = LANGUAGE_ALIASES.get(code.lower())

    if alias:
        return alias

    if code.lower() == "auto":
        return "auto"

    return code.lower()


def detect_source_language(text: str) -> str:
    try:
        detected = detect(text)
        detected = normalize_language(detected)

        if detected in SUPPORTED_CODES:
            return detected

        return "en"

    except LangDetectException:
        return "en"

    except Exception:
        logger.exception("Language detection failed")
        return "en"


# ==========================================
# TEXT CHUNKING
# ==========================================

def split_text(text: str, max_length: int = 450):
    """
    Splits long text into smaller chunks.
    """

    words = text.split()

    if not words:
        return []

    chunks = []
    current_chunk = ""

    for word in words:

        if len(word) > max_length:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""

            for start in range(0, len(word), max_length):
                chunks.append(word[start:start + max_length])

            continue

        if not current_chunk:
            current_chunk = word

        elif len(current_chunk) + len(word) + 1 <= max_length:
            current_chunk += " " + word

        else:
            chunks.append(current_chunk)
            current_chunk = word

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


# ==========================================
# MYMEMORY TRANSLATION
# ==========================================

def translate_mymemory(text: str, source: str, target: str) -> str:

    url = "https://api.mymemory.translated.net/get"

    response = requests.get(
        url,
        params={
            "q": text,
            "langpair": f"{source}|{target}"
        },
        timeout=12
    )

    response.raise_for_status()

    data = response.json()

    if data.get("responseStatus") != 200:
        raise Exception(
            data.get("responseDetails", "MyMemory translation failed")
        )

    translated = data.get("responseData", {}).get(
        "translatedText", ""
    )

    translated = html.unescape(translated).strip()

    if not translated:
        raise Exception("MyMemory returned an empty translation")

    return translated


# ==========================================
# LIBRETRANSLATE BACKUP
# ==========================================

def translate_libre(text: str, source: str, target: str) -> str:

    url = "https://translate.argosopentech.com/translate"

    response = requests.post(
        url,
        json={
            "q": text,
            "source": source,
            "target": target,
            "format": "text"
        },
        timeout=12
    )

    response.raise_for_status()

    data = response.json()

    translated = data.get("translatedText", "").strip()

    if not translated:
        raise Exception("LibreTranslate returned empty translation")

    return translated


# ==========================================
# MAIN TRANSLATION ENGINE
# ==========================================

def translate_text(text: str, source: str, target: str):

    text = (text or "").strip()

    if not text:
        raise ValueError("Please enter text to translate.")

    if len(text) > 20000:
        raise ValueError("Text is too long. Maximum limit is 20000 characters.")

    source = normalize_language(source)
    target = normalize_language(target)

    if source == "auto":
        source = detect_source_language(text)

    if source not in SUPPORTED_CODES:
        raise ValueError("Unsupported source language.")

    if target not in SUPPORTED_CODES:
        raise ValueError("Unsupported target language.")

    if source == target:
        return text, source, "Same Language"

    chunks = split_text(text)

    translated_chunks = []
    engine_used = None

    for chunk in chunks:

        translated = None

        # First provider: MyMemory
        try:
            translated = translate_mymemory(
                chunk,
                source,
                target
            )

            engine_used = "MyMemory"

        except Exception as error:
            logger.warning("MyMemory failed: %s", error)

        # Backup provider: LibreTranslate
        if not translated:

            try:
                translated = translate_libre(
                    chunk,
                    source,
                    target
                )

                engine_used = "LibreTranslate"

            except Exception as error:
                logger.error("LibreTranslate failed: %s", error)

        if not translated:
            raise RuntimeError(
                "Translation services are temporarily unavailable. Please try again."
            )

        translated_chunks.append(translated)

    final_translation = " ".join(translated_chunks)

    return final_translation, source, engine_used


# ==========================================
# OCR - LAZY LOADING
# ==========================================

ocr_reader = None


def get_ocr_reader():
    """
    EasyOCR and NumPy are imported only when image OCR is requested.
    They are not loaded during normal text translation.
    """

    global ocr_reader

    if ocr_reader is None:

        logger.info("Loading EasyOCR for image translation...")

        try:
            import easyocr

            ocr_reader = easyocr.Reader(
                ["en"],
                gpu=False,
                verbose=False
            )

            logger.info("EasyOCR loaded successfully.")

        except Exception as error:
            logger.exception("EasyOCR initialization failed")
            raise RuntimeError(
                "Image OCR is unavailable on this server."
            ) from error

    return ocr_reader


# ==========================================
# HOME
# ==========================================

@app.get("/")
async def home():

    index_file = TEMPLATES_DIR / "index.html"

    if not index_file.exists():
        raise HTTPException(
            status_code=500,
            detail="Frontend file templates/index.html was not found."
        )

    return FileResponse(str(index_file))


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
async def health():

    return {
        "success": True,
        "status": "running",
        "application": "TransAI",
        "version": APP_VERSION
    }


# ==========================================
# LANGUAGES
# ==========================================

@app.get("/languages")
async def get_languages():

    return {
        "success": True,
        "languages": LANGUAGES
    }


# ==========================================
# TEXT TRANSLATION
# ==========================================

@app.post("/translate")
async def translate(request: TranslateRequest):

    try:

        translated, detected_source, engine = translate_text(
            request.text,
            request.source_language,
            request.target_language
        )

        return {
            "success": True,
            "original_text": request.text,
            "translated_text": translated,
            "source_language": detected_source,
            "target_language": normalize_language(
                request.target_language
            ),
            "engine": engine
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except RuntimeError as error:

        logger.error("Translation service error: %s", error)

        raise HTTPException(
            status_code=502,
            detail=str(error)
        )

    except Exception as error:

        logger.exception("Unexpected translation error")

        raise HTTPException(
            status_code=500,
            detail="An unexpected translation error occurred."
        )


# ==========================================
# IMAGE TRANSLATION
# ==========================================

@app.post("/translate-image")
async def translate_image(
    file: UploadFile = File(...),
    source_language: str = Form("auto"),
    target_language: str = Form("hi")
):

    try:

        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="Please select an image."
            )

        allowed_types = {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/bmp"
        }

        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="Please upload a JPG, PNG, WEBP or BMP image."
            )

        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        if len(image_bytes) > 8 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image size must be less than 8 MB."
            )

        # Heavy libraries are imported only for image requests.
        try:
            import numpy as np
            from PIL import Image, UnidentifiedImageError

            image = Image.open(
                BytesIO(image_bytes)
            ).convert("RGB")

            # Limit image dimensions to reduce memory usage.
            image.thumbnail((1600, 1600))

            image_array = np.array(image)

        except (UnidentifiedImageError, OSError):
            raise HTTPException(
                status_code=400,
                detail="Invalid or unsupported image file."
            )

        reader = get_ocr_reader()

        extracted_lines = reader.readtext(
            image_array,
            detail=0,
            paragraph=True
        )

        extracted_text = "\n".join(
            str(line).strip()
            for line in extracted_lines
            if str(line).strip()
        )

        if not extracted_text:
            raise HTTPException(
                status_code=400,
                detail="No readable text found in this image."
            )

        translated, detected_source, engine = translate_text(
            extracted_text,
            source_language,
            target_language
        )

        return {
            "success": True,
            "extracted_text": extracted_text,
            "translated_text": translated,
            "source_language": detected_source,
            "target_language": normalize_language(
                target_language
            ),
            "engine": engine
        }

    except HTTPException:
        raise

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except RuntimeError as error:

        logger.error("Image processing error: %s", error)

        raise HTTPException(
            status_code=503,
            detail=str(error)
        )

    except Exception as error:

        logger.exception("Unexpected image translation error")

        raise HTTPException(
            status_code=500,
            detail="Image translation failed. Please try another image."
        )


# ==========================================
# STARTUP MESSAGE
# ==========================================

@app.on_event("startup")
async def startup_event():

    logger.info("================================")
    logger.info("TRANSAI BACKEND STARTED")
    logger.info("Version: %s", APP_VERSION)
    logger.info("OCR: Lazy loading enabled")
    logger.info("================================")
