from io import BytesIO
from pathlib import Path
import os
import requests

import easyocr
import numpy as np

from PIL import Image, UnidentifiedImageError
from langdetect import detect, LangDetectException

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile
)

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


# =====================================
# TRANSAI PROJECT CONFIGURATION
# =====================================

BASE_DIR = Path(__file__).resolve().parent


def find_folder(folder_name):

    for folder in BASE_DIR.iterdir():

        if folder.is_dir() and folder.name.lower() == folder_name.lower():
            return folder

    return BASE_DIR / folder_name


TEMPLATES_DIR = find_folder("templates")
STATIC_DIR = find_folder("static")


# =====================================
# TRANSLATION SERVICES
# =====================================

LIBRE_URL = os.getenv(
    "LIBRE_URL",
    "https://translate.argosopentech.com"
)

MYMEMORY_URL = "https://api.mymemory.translated.net/get"


# =====================================
# FASTAPI APPLICATION
# =====================================

app = FastAPI(
    title="TransAI AI Translator",
    description="AI-powered language translation application",
    version="3.1.0"
)


# =====================================
# STATIC FILES
# =====================================

if STATIC_DIR.is_dir():

    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR)),
        name="static"
    )


# =====================================
# SUPPORTED LANGUAGES
# =====================================

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
    {"code": "zh", "name": "Chinese"},
    {"code": "ko", "name": "Korean"},
    {"code": "ar", "name": "Arabic"},
    {"code": "tr", "name": "Turkish"},
    {"code": "nl", "name": "Dutch"},
    {"code": "pl", "name": "Polish"},
    {"code": "uk", "name": "Ukrainian"},
    {"code": "vi", "name": "Vietnamese"},
    {"code": "th", "name": "Thai"},
    {"code": "id", "name": "Indonesian"},
    {"code": "ms", "name": "Malay"},
    {"code": "fa", "name": "Persian"},
    {"code": "el", "name": "Greek"},
    {"code": "he", "name": "Hebrew"},
    {"code": "sv", "name": "Swedish"},
    {"code": "da", "name": "Danish"},
    {"code": "fi", "name": "Finnish"},
    {"code": "no", "name": "Norwegian"},
    {"code": "cs", "name": "Czech"},
    {"code": "ro", "name": "Romanian"},
    {"code": "hu", "name": "Hungarian"},
    {"code": "ta", "name": "Tamil"},
    {"code": "te", "name": "Telugu"},
    {"code": "mr", "name": "Marathi"},
    {"code": "gu", "name": "Gujarati"},
    {"code": "pa", "name": "Punjabi"}

]


LANGUAGE_CODES = {

    language["code"]: language["name"]

    for language in LANGUAGES

}


# =====================================
# LANGUAGE NORMALIZATION
# =====================================

LANGUAGE_ALIASES = {

    "zh-cn": "zh",
    "zh-tw": "zh",
    "iw": "he",
    "in": "id",
    "nb": "no"

}


def normalize_language(language):

    if not language:
        return "auto"

    language = language.strip().lower()

    language = LANGUAGE_ALIASES.get(
        language,
        language
    )

    if language in LANGUAGE_CODES:
        return language

    for code, name in LANGUAGE_CODES.items():

        if name.lower() == language:
            return code

    return "auto"


# =====================================
# AUTOMATIC LANGUAGE DETECTION
# =====================================

def detect_source_language(text):

    try:

        detected = detect(text)

        detected = normalize_language(detected)

        if detected == "auto":
            return "en"

        return detected

    except LangDetectException:

        return "en"

    except Exception:

        return "en"


# =====================================
# TRANSLATION REQUEST MODEL
# =====================================

class TranslateRequest(BaseModel):

    text: str = Field(
        ...,
        min_length=1,
        max_length=10000
    )

    source_language: str = "auto"

    target_language: str = "hi"


# =====================================
# LIBRETRANSLATE ENGINE
# =====================================

def libre_translate(text, source, target):

    url = f"{LIBRE_URL.rstrip('/')}/translate"

    payload = {

        "q": text,
        "source": source,
        "target": target,
        "format": "text"

    }

    response = requests.post(

        url,

        json=payload,

        timeout=30

    )

    response.raise_for_status()

    data = response.json()

    translated_text = data.get("translatedText")

    if not translated_text:

        raise ValueError(
            "LibreTranslate returned empty response"
        )

    return translated_text


# =====================================
# MYMEMORY TRANSLATION ENGINE
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

    response_data = data.get(
        "responseData",
        {}
    )

    translated_text = response_data.get(
        "translatedText"
    )

    if not translated_text:

        raise ValueError(
            "MyMemory returned empty response"
        )

    response_status = data.get("responseStatus")

    if response_status and int(response_status) != 200:

        raise ValueError(
            data.get(
                "responseDetails",
                "MyMemory translation failed"
            )
        )

    return translated_text


# =====================================
# MAIN TRANSLATION FUNCTION
# =====================================

def translate_text(
    text,
    source_language,
    target_language
):

    text = text.strip()

    if not text:

        raise HTTPException(
            status_code=400,
            detail="Please enter text to translate."
        )

    source = normalize_language(source_language)

    target = normalize_language(target_language)

    if target == "auto":

        raise HTTPException(
            status_code=400,
            detail="Please select a target language."
        )

    if source == "auto":

        source = detect_source_language(text)

    if source == target:

        return {

            "translated_text": text,

            "engine": "No Translation Needed",

            "source_language": source,

            "target_language": target

        }

    errors = []

    # FIRST ENGINE: MYMEMORY

    try:

        result = mymemory_translate(

            text,

            source,

            target

        )

        return {

            "translated_text": result,

            "engine": "MyMemory",

            "source_language": source,

            "target_language": target

        }

    except Exception as error:

        errors.append(
            f"MyMemory: {str(error)}"
        )

        print(
            "MyMemory failed:",
            str(error),
            flush=True
        )

    # SECOND ENGINE: LIBRETRANSLATE

    try:

        result = libre_translate(

            text,

            source,

            target

        )

        return {

            "translated_text": result,

            "engine": "LibreTranslate",

            "source_language": source,

            "target_language": target

        }

    except Exception as error:

        errors.append(
            f"LibreTranslate: {str(error)}"
        )

        print(
            "LibreTranslate failed:",
            str(error),
            flush=True
        )

    raise HTTPException(

        status_code=502,

        detail={

            "message": "All translation services are currently unavailable.",

            "errors": errors

        }

    )


# =====================================
# HOME PAGE
# =====================================

@app.get("/")
def home():

    possible_paths = [

        TEMPLATES_DIR / "index.html",

        BASE_DIR / "index.html"

    ]

    index_file = next(

        (

            path for path in possible_paths

            if path.is_file()

        ),

        None

    )

    if index_file is None:

        print(
            "HTML FILE NOT FOUND!",
            flush=True
        )

        print(
            "BASE DIR:",
            BASE_DIR,
            flush=True
        )

        print(
            "TEMPLATES DIR:",
            TEMPLATES_DIR,
            flush=True
        )

        print(
            "PROJECT FILES:",
            list(BASE_DIR.iterdir()),
            flush=True
        )

        raise HTTPException(

            status_code=404,

            detail="index.html not found. Check templates folder."

        )

    return FileResponse(

        str(index_file),

        media_type="text/html"

    )


# =====================================
# HEALTH CHECK API
# =====================================

@app.get("/health")
def health():

    return {

        "status": "online",

        "application": "TransAI AI Translator",

        "version": "3.1.0",

        "translation_engines": [

            "MyMemory",

            "LibreTranslate"

        ],

        "ocr": "EasyOCR"

    }


# =====================================
# LANGUAGES API
# =====================================

@app.get("/languages")
def get_languages():

    return {

        "languages": LANGUAGES

    }


# =====================================
# TEXT TRANSLATION API
# =====================================

@app.post("/translate")
def translate(request: TranslateRequest):

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


# =====================================
# IMAGE OCR SETUP
# =====================================

ocr_reader = None


def get_ocr_reader():

    global ocr_reader

    if ocr_reader is None:

        print(
            "Loading EasyOCR...",
            flush=True
        )

        ocr_reader = easyocr.Reader(

            ["en"],

            gpu=False

        )

        print(
            "EasyOCR loaded successfully.",
            flush=True
        )

    return ocr_reader


# =====================================
# IMAGE TRANSLATION API
# =====================================

@app.post("/translate-image")
async def translate_image(

    file: UploadFile = File(...),

    source_language: str = Form("auto"),

    target_language: str = Form("hi")

):

    if (
        not file.content_type
        or not file.content_type.startswith("image/")
    ):

        raise HTTPException(

            status_code=400,

            detail="Please upload a valid image file."

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

        image = Image.open(

            BytesIO(image_bytes)

        ).convert("RGB")

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

            if line.strip()

        )

        if not extracted_text:

            raise HTTPException(

                status_code=422,

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

    except UnidentifiedImageError:

        raise HTTPException(

            status_code=400,

            detail="Invalid or unsupported image."

        )

    except Exception as error:

        print(

            "Image translation error:",

            str(error),

            flush=True

        )

        raise HTTPException(

            status_code=500,

            detail="Unable to process this image. Please try another image."

        )


# =====================================
# TRANSAI STARTUP MESSAGE
# =====================================

@app.on_event("startup")
async def startup_event():

    print("================================")

    print(" TRANSAI AI TRANSLATOR")

    print(" Backend Started Successfully")

    print(" Primary: MyMemory")

    print(" Backup: LibreTranslate")

    print(" OCR: EasyOCR")

    print("================================")