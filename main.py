
from io import BytesIO
from pathlib import Path
import requests
import easyocr
import numpy as np

from PIL import Image, UnidentifiedImageError
from langdetect import detect, LangDetectException

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


# =====================================
# CONFIGURATION
# =====================================

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

LIBRE_URL = "http://127.0.0.1:5000"
MYMEMORY_URL = "https://api.mymemory.translated.net/get"

app = FastAPI(
    title="VYRA Aurora AI Translator",
    version="3.0.0"
)

STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# =====================================
# LANGUAGE LIST
# =====================================

LANGUAGES = {
    "English": "en",
    "Hindi": "hi",
    "Bengali": "bn",
    "Gujarati": "gu",
    "Marathi": "mr",
    "Tamil": "ta",
    "Telugu": "te",
    "Punjabi": "pa",
    "Urdu": "ur",
    "Malayalam": "ml",
    "Kannada": "kn",
    "French": "fr",
    "German": "de",
    "Spanish": "es",
    "Italian": "it",
    "Portuguese": "pt",
    "Russian": "ru",
    "Japanese": "ja",
    "Chinese": "zh",
    "Korean": "ko",
    "Arabic": "ar",
    "Turkish": "tr",
    "Dutch": "nl",
    "Thai": "th",
    "Indonesian": "id",
    "Vietnamese": "vi",
    "Nepali": "ne",
    "Persian": "fa",
    "Swahili": "sw",
    "Ukrainian": "uk",
    "Greek": "el",
    "Hebrew": "he",
    "Polish": "pl",
    "Romanian": "ro",
    "Swedish": "sv",
    "Danish": "da",
    "Norwegian": "no",
    "Finnish": "fi"
}

CODE_TO_NAME = {
    code.lower(): name
    for name, code in LANGUAGES.items()
}

# Chinese simplified is the LibreTranslate code.
LIBRE_CODES = {
    "zh": "zh"
}


# =====================================
# REQUEST MODEL
# =====================================

class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str = "auto"
    target_language: str


# =====================================
# LANGUAGE NORMALIZATION
# =====================================

def normalize_language(value, allow_auto=False):

    value = (value or "").strip()
    lowered = value.lower()

    if allow_auto and lowered in ("auto", "detect", "automatic"):
        return "auto"

    if lowered in CODE_TO_NAME:
        return CODE_TO_NAME[lowered]

    for name in LANGUAGES:
        if name.lower() == lowered:
            return name

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported language: {value}"
    )


def get_language_code(language):

    if language == "auto":
        return "auto"

    return LANGUAGES[language]


# =====================================
# DETECT SOURCE LANGUAGE
# =====================================

def detect_source_language(text):

    try:
        detected = detect(text)

        if detected in CODE_TO_NAME:
            return detected

        return "en"

    except LangDetectException:
        return "en"


# =====================================
# PRIMARY ENGINE
# LOCAL LIBRETRANSLATE
# =====================================

def libre_translate(text, source, target):

    payload = {
        "q": text,
        "source": source,
        "target": target,
        "format": "text"
    }

    response = requests.post(
        f"{LIBRE_URL}/translate",
        json=payload,
        timeout=40
    )

    response.raise_for_status()

    data = response.json()
    result = data.get("translatedText")

    if not result:
        raise ValueError("LibreTranslate returned empty result")

    return result


# =====================================
# BACKUP ENGINE
# MYMEMORY
# =====================================

def mymemory_translate(text, source, target):

    params = {
        "q": text,
        "langpair": f"{source}|{target}"
    }

    response = requests.get(
        MYMEMORY_URL,
        params=params,
        timeout=25
    )

    response.raise_for_status()

    data = response.json()

    if data.get("responseStatus") != 200:
        raise ValueError(
            data.get("responseDetails", "MyMemory translation failed")
        )

    result = data.get("responseData", {}).get("translatedText")

    if not result:
        raise ValueError("MyMemory returned empty result")

    return result


# =====================================
# MAIN TRANSLATION SYSTEM
# =====================================

def translate_text(text, source_language, target_language):

    text = (text or "").strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Please enter text to translate."
        )

    if len(text) > 4500:
        raise HTTPException(
            status_code=400,
            detail="Maximum 4500 characters allowed."
        )

    source_name = normalize_language(
        source_language,
        allow_auto=True
    )

    target_name = normalize_language(target_language)

    target_code = get_language_code(target_name)

    if source_name == "auto":

        source_code = detect_source_language(text)

    else:

        source_code = get_language_code(source_name)

    if source_code == target_code:
        return text, "No translation needed"

    errors = []

    # FIRST: LOCAL LIBRETRANSLATE

    try:

        result = libre_translate(
            text,
            source_code,
            target_code
        )

        return result, "LibreTranslate"

    except Exception as exc:

        errors.append(
            f"LibreTranslate: {type(exc).__name__}: {exc}"
        )

        print("Primary engine failed:", exc, flush=True)

    # SECOND: MYMEMORY BACKUP

    try:

        result = mymemory_translate(
            text,
            source_code,
            target_code
        )

        return result, "MyMemory Backup"

    except Exception as exc:

        errors.append(
            f"MyMemory: {type(exc).__name__}: {exc}"
        )

        print("Backup engine failed:", exc, flush=True)

    raise HTTPException(
        status_code=502,
        detail={
            "message": "All translation services are unavailable.",
            "errors": errors
        }
    )


# =====================================
# OCR ENGINE
# =====================================

_ocr_reader = None


def get_ocr_reader():

    global _ocr_reader

    if _ocr_reader is None:

        print("Loading EasyOCR...")

        _ocr_reader = easyocr.Reader(
            ["en"],
            gpu=False
        )

    return _ocr_reader


# =====================================
# HOME PAGE
# =====================================

@app.get("/")
def home():

    index_file = TEMPLATES_DIR / "index.html"

    if not index_file.exists():

        raise HTTPException(
            status_code=404,
            detail="index.html not found"
        )

    return FileResponse(index_file)


# =====================================
# HEALTH CHECK
# =====================================

@app.get("/health")
def health():

    try:

        response = requests.get(
            f"{LIBRE_URL}/health",
            timeout=3
        )

        primary_status = (
            "online" if response.ok else "offline"
        )

    except Exception:

        primary_status = "offline"

    return {
        "status": "ok",
        "app": "TransAI",
        "primary_engine": "LibreTranslate",
        "primary_status": primary_status,
        "backup_engine": "MyMemory"
    }


# =====================================
# LANGUAGES API
# =====================================

@app.get("/languages")
def languages():

    return {
        "languages": [
            {"name": name, "code": code}
            for name, code in LANGUAGES.items()
        ]
    }


# =====================================
# TEXT TRANSLATION API
# =====================================

@app.post("/translate")
def translate(request: TranslateRequest):

    result, engine = translate_text(
        request.text,
        request.source_language,
        request.target_language
    )

    return {
        "success": True,
        "translated_text": result,
        "engine": engine
    }


# =====================================
# IMAGE TRANSLATION API
# =====================================

@app.post("/translate-image")
async def translate_image(
    image: UploadFile = File(...),
    target_language: str = Form(...)
):

    if not image.content_type or not image.content_type.startswith("image/"):

        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image."
        )

    try:

        raw = await image.read()

        if not raw:
            raise HTTPException(
                status_code=400,
                detail="Image is empty."
            )

        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="Image must be below 10 MB."
            )

        pil_image = Image.open(
            BytesIO(raw)
        ).convert("RGB")

        image_array = np.array(pil_image)

        reader = get_ocr_reader()

        detected_lines = reader.readtext(
            image_array,
            detail=0,
            paragraph=True
        )

        extracted_text = "\n".join(
            line.strip()
            for line in detected_lines
            if line.strip()
        )

        if not extracted_text:

            return {
                "success": True,
                "extracted_text": "",
                "translated_text": "No readable text found."
            }

        translated, engine = translate_text(
            extracted_text,
            "auto",
            target_language
        )

        return {
            "success": True,
            "extracted_text": extracted_text,
            "translated_text": translated,
            "engine": engine
        }

    except HTTPException:
        raise

    except UnidentifiedImageError:

        raise HTTPException(
            status_code=400,
            detail="Invalid image format."
        )

    except Exception as exc:

        print("Image error:", exc, flush=True)

        raise HTTPException(
            status_code=400,
            detail="Image processing failed."
        )

    finally:

        await image.close()


# =====================================
# STARTUP
# =====================================

@app.on_event("startup")
async def startup():

    print("================================")
    print(" TransAI AI TRANSLATOR")
    print(" Backend Started")
    print(" Primary: LibreTranslate")
    print(" Backup: MyMemory")
    print("================================")
