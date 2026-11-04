// =============================================
// TRANSAI - PREMIUM AI TRANSLATOR
// COMPLETE JAVASCRIPT - VERSION 4.1
// =============================================

const $ = (id) => document.getElementById(id);

let languages = [];
let lastTranslation = "";
let cameraStream = null;
let recognition = null;
let pendingImageFile = null;
let imagePreviewURL = null;

const MAX_CHARACTERS = 4500;


// =============================================
// SAFE STORAGE
// =============================================

function storageGet(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn("Storage unavailable:", error);
        return false;
    }
}

function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.warn("Storage unavailable:", error);
    }
}


// =============================================
// MESSAGE SYSTEM
// =============================================

function showMessage(text, type = "") {
    const message = $("message");

    if (!message) return;

    message.textContent = String(text);
    message.className = type;
}


// =============================================
// API RESPONSE HANDLER
// =============================================

async function getResponse(response) {
    const responseText = await response.text();

    let data;

    try {
        data = JSON.parse(responseText);
    } catch {
        console.error(
            "Non-JSON server response:",
            responseText.slice(0, 500)
        );

        if (response.status >= 500) {
            throw new Error(
                "Server error. Please try again after some time."
            );
        }

        throw new Error(
            "Server returned an invalid response. Please check the deployment."
        );
    }

    if (!response.ok) {
        let errorMessage = "Something went wrong. Please try again.";

        if (typeof data.detail === "string") {
            errorMessage = data.detail;
        } else if (
            data.detail &&
            typeof data.detail === "object"
        ) {
            errorMessage =
                data.detail.message ||
                data.detail.error ||
                "Translation service error.";
        } else if (data.message) {
            errorMessage = data.message;
        }

        throw new Error(errorMessage);
    }

    return data;
}


// =============================================
// SAFE TRANSLATION TEXT
// =============================================

function getTranslationText(data) {
    const value = data.translated_text;

    if (typeof value === "string") {
        return value;
    }

    if (value && typeof value === "object") {
        if (typeof value.translatedText === "string") {
            return value.translatedText;
        }

        if (typeof value.text === "string") {
            return value.text;
        }

        if (typeof value.translation === "string") {
            return value.translation;
        }
    }

    throw new Error(
        "Translation response format is incorrect."
    );
}


// =============================================
// LOAD LANGUAGES
// =============================================

async function loadLanguages() {
    try {
        showMessage("Loading languages...");

        const response = await fetch("/languages");
        const data = await getResponse(response);

        languages = Array.isArray(data.languages)
            ? data.languages.filter(
                language =>
                    language &&
                    language.code &&
                    language.code !== "auto"
            )
            : [];

        const source = $("sourceLanguage");
        const target = $("targetLanguage");

        if (!source || !target) return;

        source.innerHTML = "";
        target.innerHTML = "";

        // Auto Detect - only once
        const autoOption = document.createElement("option");
        autoOption.value = "auto";
        autoOption.textContent = "Auto-detect";
        source.appendChild(autoOption);

        // Target placeholder
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose Language";
        target.appendChild(placeholder);

        languages.forEach(language => {
            const sourceOption = document.createElement("option");
            sourceOption.value = language.code;
            sourceOption.textContent = language.name;

            const targetOption = document.createElement("option");
            targetOption.value = language.code;
            targetOption.textContent = language.name;

            source.appendChild(sourceOption);
            target.appendChild(targetOption);
        });

        source.value = "auto";

        target.value = languages.some(
            language => language.code === "hi"
        ) ? "hi" : "";

        showMessage("");

    } catch (error) {
        console.error("Language loading error:", error);
        showMessage(error.message, "error");
    }
}


// =============================================
// CHARACTER COUNT
// =============================================

function updateCharacterCount() {
    const sourceText = $("sourceText");
    const charCount = $("charCount");

    if (!sourceText || !charCount) return;

    charCount.textContent =
        `${sourceText.value.length} / ${MAX_CHARACTERS}`;
}

if ($("sourceText")) {
    $("sourceText").addEventListener(
        "input",
        updateCharacterCount
    );
}


// =============================================
// TEXT TRANSLATION
// =============================================

async function translateText() {
    const sourceText = $("sourceText");
    const sourceLanguage = $("sourceLanguage");
    const targetLanguage = $("targetLanguage");
    const resultText = $("resultText");
    const button = $("translateBtn");

    if (
        !sourceText ||
        !sourceLanguage ||
        !targetLanguage ||
        !resultText
    ) return;

    const text = sourceText.value.trim();
    const source = sourceLanguage.value;
    const target = targetLanguage.value;

    if (!text) {
        showMessage("Please enter some text.", "error");
        return;
    }

    if (text.length > MAX_CHARACTERS) {
        showMessage(
            `Maximum ${MAX_CHARACTERS} characters allowed.`,
            "error"
        );
        return;
    }

    if (!target) {
        showMessage(
            "Please choose a target language.",
            "error"
        );
        return;
    }

    if (source === target) {
        showMessage(
            "Source and target languages cannot be the same.",
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Translating...';
    }

    showMessage("Translating your text...");

    try {
        const response = await fetch("/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text,
                source_language: source,
                target_language: target
            })
        });

        const data = await getResponse(response);

        lastTranslation = getTranslationText(data);

        resultText.textContent = lastTranslation;

        if ($("resultMeta")) {
            $("resultMeta").textContent =
                `${lastTranslation.length} characters`;
        }

        saveHistory(
            text,
            lastTranslation,
            sourceLanguage.selectedOptions[0]?.textContent || source,
            targetLanguage.selectedOptions[0]?.textContent || target
        );

        showMessage(
            "Translation completed successfully!",
            "success"
        );

    } catch (error) {
        console.error("Translation error:", error);
        showMessage(error.message, "error");

    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML =
                '<i class="fa-solid fa-language"></i> &nbsp; Translate <span>→</span>';
        }
    }
}

if ($("translateBtn")) {
    $("translateBtn").addEventListener(
        "click",
        translateText
    );
}

if ($("sourceText")) {
    $("sourceText").addEventListener("keydown", event => {
        if (event.ctrlKey && event.key === "Enter") {
            translateText();
        }
    });
}


// =============================================
// IMAGE PREVIEW
// =============================================

function showImagePreview(file) {
    if (!file) return;

    // Always show the preview on the translator page, including
    // when the image was selected from the Multimodal page.
    showPage("translator");

    pendingImageFile = file;

    if (imagePreviewURL) {
        URL.revokeObjectURL(imagePreviewURL);
    }

    imagePreviewURL = URL.createObjectURL(file);

    let panel = $("imagePreviewPanel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "imagePreviewPanel";
        panel.style.cssText = [
            "display:none",
            "margin-top:16px",
            "padding:14px",
            "border:1px solid var(--border-color, #dbe2ea)",
            "border-radius:14px",
            "background:var(--card-bg, #fff)",
            "width:100%",
            "box-sizing:border-box"
        ].join(";");

        const sourceCard = document.querySelector(".source-card");
        if (sourceCard) {
            sourceCard.appendChild(panel);
        }
    }

    panel.innerHTML = "";

    const heading = document.createElement("div");
    heading.textContent = "Image Preview";
    heading.style.cssText = "font-weight:700;margin-bottom:10px;";

    const image = document.createElement("img");
    image.id = "imagePreview";
    image.src = imagePreviewURL;
    image.alt = "Selected image preview";
    image.style.cssText = [
        "display:block",
        "width:100%",
        "max-height:300px",
        "object-fit:contain",
        "border-radius:10px",
        "background:#f1f5f9",
        "margin-bottom:10px"
    ].join(";");

    const filename = document.createElement("p");
    filename.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    filename.style.cssText = "font-size:13px;opacity:.75;overflow-wrap:anywhere;margin:8px 0 12px;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";

    const translateButton = document.createElement("button");
    translateButton.type = "button";
    translateButton.textContent = "Translate Image";
    translateButton.className = "translate-main";
    translateButton.style.cssText = "flex:1;min-width:150px;";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.className = "secondary-btn";

    translateButton.addEventListener("click", async () => {
        if (!pendingImageFile) return;
        translateButton.disabled = true;
        translateButton.textContent = "Processing image...";
        try {
            await translateImage(pendingImageFile);
        } finally {
            translateButton.disabled = false;
            translateButton.textContent = "Translate Image";
        }
    });

    removeButton.addEventListener("click", clearImagePreview);

    actions.append(translateButton, removeButton);
    panel.append(heading, image, filename, actions);
    panel.style.display = "block";

    showMessage("Image ready. Check the preview, then click Translate Image.", "success");
}

function clearImagePreview() {
    pendingImageFile = null;

    if (imagePreviewURL) {
        URL.revokeObjectURL(imagePreviewURL);
        imagePreviewURL = null;
    }

    const panel = $("imagePreviewPanel");
    if (panel) {
        panel.style.display = "none";
        panel.innerHTML = "";
    }

    if ($("imageInput")) {
        $("imageInput").value = "";
    }
}// =============================================
// IMAGE TRANSLATION
// =============================================

async function translateImage(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showMessage("Please select a valid image.", "error");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showMessage(
            "Image size must be less than 10 MB.",
            "error"
        );
        return;
    }

    const target = $("targetLanguage")?.value;
    const source = $("sourceLanguage")?.value || "auto";

    if (!target) {
        showMessage(
            "Please choose a target language.",
            "error"
        );
        return;
    }

    const formData = new FormData();

    // Backend expects the field name "file"
    formData.append("file", file);
    formData.append("source_language", source);
    formData.append("target_language", target);

    showMessage("Extracting text from image...");

    try {
        const response = await fetch("/translate-image", {
            method: "POST",
            body: formData
        });

        const data = await getResponse(response);

        if (data.extracted_text) {
            $("sourceText").value = data.extracted_text;
            updateCharacterCount();
        }

        lastTranslation = getTranslationText(data);

        if ($("resultText")) {
            $("resultText").textContent = lastTranslation;
        }

        if ($("resultMeta")) {
            $("resultMeta").textContent =
                `${lastTranslation.length} characters`;
        }

        saveHistory(
            data.extracted_text || "",
            lastTranslation,
            $("sourceLanguage")?.selectedOptions[0]?.textContent || source,
            $("targetLanguage")?.selectedOptions[0]?.textContent || target
        );

        showMessage(
            "Image translated successfully!",
            "success"
        );

    } catch (error) {
        console.error("Image translation error:", error);
        showMessage(error.message, "error");
    }
}


// =============================================
// IMAGE UPLOAD
// =============================================

function openImagePicker() {
    $("imageInput")?.click();
}

if ($("uploadBtn")) {
    $("uploadBtn").addEventListener(
        "click",
        openImagePicker
    );
}

if ($("multiUpload")) {
    $("multiUpload").addEventListener(
        "click",
        openImagePicker
    );
}

if ($("imageInput")) {
    $("imageInput").addEventListener("change", event => {
        const file = event.target.files[0];

        if (file) {
            showImagePreview(file);
        }

        // Reset input so the same image can be selected again.
        event.target.value = "";
    });
}


// =============================================
// CAMERA SYSTEM
// =============================================

async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        showMessage(
            "Camera requires HTTPS or localhost.",
            "error"
        );
        return;
    }

    try {
        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                },
                audio: false
            });

        const video = $("cameraVideo");
        const modal = $("cameraModal");

        if (!video || !modal) {
            closeCamera();
            return;
        }

        video.srcObject = cameraStream;
        modal.classList.add("open");

        await video.play();

    } catch (error) {
        console.error("Camera error:", error);

        showMessage(
            "Camera permission denied or camera unavailable.",
            "error"
        );
    }
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
        });

        cameraStream = null;
    }

    if ($("cameraVideo")) {
        $("cameraVideo").srcObject = null;
    }

    $("cameraModal")?.classList.remove("open");
}

if ($("cameraBtn")) {
    $("cameraBtn").addEventListener("click", openCamera);
}

if ($("multiCamera")) {
    $("multiCamera").addEventListener("click", openCamera);
}

if ($("closeCamera")) {
    $("closeCamera").addEventListener("click", closeCamera);
}

if ($("captureBtn")) {
    $("captureBtn").addEventListener("click", async () => {
        const video = $("cameraVideo");
        const canvas = $("cameraCanvas");

        if (!video || !canvas || !video.videoWidth) {
            showMessage("Camera is not ready.", "error");
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");

        if (!context) {
            showMessage("Unable to capture image.", "error");
            return;
        }

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const blob = await new Promise(resolve => {
            canvas.toBlob(
                resolve,
                "image/jpeg",
                0.9
            );
        });

        closeCamera();

        if (!blob) {
            showMessage("Unable to capture image.", "error");
            return;
        }

        const file = new File(
            [blob],
            "camera-image.jpg",
            { type: "image/jpeg" }
        );

        showImagePreview(file);
    });
}


// =============================================
// VOICE LANGUAGE
// =============================================

function getVoiceLanguage() {
    const selected =
        $("sourceLanguage")?.value?.toLowerCase() || "auto";

    const voiceLanguages = {
        auto: "en-IN",
        en: "en-IN",
        hi: "hi-IN",
        bn: "bn-IN",
        ur: "ur-PK",
        fr: "fr-FR",
        de: "de-DE",
        es: "es-ES",
        ja: "ja-JP",
        zh: "zh-CN",
        "zh-cn": "zh-CN",
        ar: "ar-SA",
        ru: "ru-RU",
        pt: "pt-PT",
        it: "it-IT",
        ne: "ne-NP",
        pa: "pa-IN",
        ta: "ta-IN",
        te: "te-IN",
        mr: "mr-IN",
        gu: "gu-IN",
        tr: "tr-TR",
        nl: "nl-NL",
        pl: "pl-PL",
        uk: "uk-UA",
        sv: "sv-SE",
        da: "da-DK",
        fi: "fi-FI",
        el: "el-GR",
        he: "he-IL",
        th: "th-TH",
        vi: "vi-VN",
        id: "id-ID",
        ms: "ms-MY"
    };

    return voiceLanguages[selected] || "en-IN";
}


// =============================================
// VOICE BUTTON UI
// =============================================

function updateVoiceUI(listening) {
    const voiceBtn = $("voiceBtn");
    const voiceFab = $("voiceFab");
    const voiceStatus = $("voiceStatus");

    [voiceBtn, voiceFab].forEach(button => {
        if (!button) return;

        button.classList.toggle("listening", listening);

        if (button.id === "voiceBtn") {
            button.innerHTML = listening
                ? '<i class="fa-solid fa-microphone"></i> Listening...'
                : '<i class="fa-solid fa-microphone"></i> Voice';
        }
    });

    if (voiceStatus) {
        voiceStatus.textContent = listening
            ? "Listening... Speak now."
            : "";
    }
}

function resetVoiceButton() {
    updateVoiceUI(false);
    recognition = null;
}


// =============================================
// SMART VOICE INPUT
// =============================================

function startVoice() {
    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        showMessage(
            "Voice input is not supported. Please use Chrome or Edge.",
            "error"
        );
        return;
    }

    const sourceText = $("sourceText");

    if (!sourceText) return;

    if (recognition) {
        recognition.stop();
        return;
    }

    const currentRecognition = new SpeechRecognition();
    recognition = currentRecognition;

    currentRecognition.lang = getVoiceLanguage();
    currentRecognition.continuous = false;
    currentRecognition.interimResults = true;
    currentRecognition.maxAlternatives = 1;

    let finalTranscript = "";

    updateVoiceUI(true);
    showMessage("Listening... Speak now.");

    currentRecognition.onresult = event => {
        let interimTranscript = "";

        for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
        ) {
            const transcript =
                event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript;
            }
        }

        sourceText.value =
            (finalTranscript + interimTranscript).trim();

        updateCharacterCount();

        sourceText.dispatchEvent(
            new Event("input", { bubbles: true })
        );
    };

    currentRecognition.onerror = event => {
        const errors = {
            "not-allowed":
                "Microphone permission denied. Allow microphone access.",
            "no-speech":
                "No speech detected. Try again.",
            "audio-capture":
                "No microphone found.",
            "network":
                "Voice recognition network error.",
            "service-not-allowed":
                "Voice recognition service is blocked.",
            "language-not-supported":
                "Selected voice language is not supported."
        };

        showMessage(
            errors[event.error] ||
            `Voice error: ${event.error}`,
            "error"
        );
    };

    currentRecognition.onend = () => {
        if (recognition === currentRecognition) {
            resetVoiceButton();
        }

        if (sourceText.value.trim()) {
            showMessage(
                "Voice text added successfully.",
                "success"
            );
        }
    };

    try {
        currentRecognition.start();
    } catch (error) {
        console.error("Voice start error:", error);

        resetVoiceButton();

        showMessage(
            "Unable to start microphone. Please try again.",
            "error"
        );
    }
}

if ($("voiceBtn")) {
    $("voiceBtn").addEventListener("click", startVoice);
}

// Floating microphone button - FIXED
if ($("voiceFab")) {
    $("voiceFab").addEventListener("click", startVoice);
}

if ($("multiVoice")) {
    $("multiVoice").addEventListener("click", () => {
        showPage("translator");
        startVoice();
    });
}


// =============================================
// LISTEN TO TRANSLATED TEXT
// =============================================

function getSpeechLanguage(code) {
    const speechCodes = {
        en: "en-US",
        hi: "hi-IN",
        bn: "bn-IN",
        ur: "ur-PK",
        fr: "fr-FR",
        de: "de-DE",
        es: "es-ES",
        ja: "ja-JP",
        zh: "zh-CN",
        ar: "ar-SA",
        ru: "ru-RU",
        pt: "pt-PT",
        it: "it-IT",
        ne: "ne-NP",
        pa: "pa-IN",
        ta: "ta-IN",
        te: "te-IN",
        mr: "mr-IN",
        gu: "gu-IN",
        tr: "tr-TR",
        nl: "nl-NL",
        pl: "pl-PL",
        uk: "uk-UA",
        sv: "sv-SE",
        da: "da-DK",
        fi: "fi-FI",
        el: "el-GR",
        he: "he-IL",
        th: "th-TH",
        vi: "vi-VN",
        id: "id-ID",
        ms: "ms-MY",
        ar: "ar-SA",
        ru: "ru-RU",
        pt: "pt-PT",
        it: "it-IT",
        ne: "ne-NP",
        pa: "pa-IN",
        ta: "ta-IN",
        te: "te-IN",
        mr: "mr-IN",
        gu: "gu-IN"
    };

    return speechCodes[code] || code || "en-US";
}if ($("listenBtn")) {
    $("listenBtn").addEventListener("click", () => {
        if (!lastTranslation) {
            showMessage("Nothing to listen to.", "error");
            return;
        }

        if (!window.speechSynthesis) {
            showMessage(
                "Speech playback is not supported.",
                "error"
            );
            return;
        }

        speechSynthesis.cancel();

        const speech = new SpeechSynthesisUtterance(
            lastTranslation
        );

        speech.lang = getSpeechLanguage(
            $("targetLanguage")?.value
        );

        speech.rate = 0.95;
        speech.pitch = 1;

        speechSynthesis.speak(speech);

        showMessage(
            "Playing translated voice...",
            "success"
        );
    });
}


// =============================================
// COPY TRANSLATION
// =============================================

async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(String(text));
        } else {
            const textarea = document.createElement("textarea");
            textarea.value = String(text);
            document.body.appendChild(textarea);
            textarea.select();

            const copied = document.execCommand("copy");
            textarea.remove();

            if (!copied) {
                throw new Error("Copy failed");
            }
        }

        showMessage("Copied successfully!", "success");

    } catch (error) {
        console.error("Copy error:", error);

        showMessage(
            "Unable to copy text. Please copy manually.",
            "error"
        );
    }
}

if ($("copyBtn")) {
    $("copyBtn").addEventListener("click", () => {
        if (!lastTranslation) {
            showMessage("Nothing to copy.", "error");
            return;
        }

        copyText(lastTranslation);
    });
}


// =============================================
// SWAP LANGUAGES
// =============================================

if ($("swapBtn")) {
    $("swapBtn").addEventListener("click", () => {
        const source = $("sourceLanguage");
        const target = $("targetLanguage");

        if (!source || !target) return;

        if (source.value === "auto") {
            showMessage(
                "Select a source language before swapping.",
                "error"
            );
            return;
        }

        if (!target.value) {
            showMessage(
                "Choose a target language first.",
                "error"
            );
            return;
        }

        if (source.value === target.value) {
            showMessage(
                "Source and target languages are already the same.",
                "error"
            );
            return;
        }

        const oldSource = source.value;
        source.value = target.value;
        target.value = oldSource;

        if (lastTranslation) {
            $("sourceText").value = lastTranslation;

            if ($("resultText")) {
                $("resultText").textContent =
                    "Your translated text will appear here...";
            }

            lastTranslation = "";

            if ($("resultMeta")) {
                $("resultMeta").textContent = "";
            }
        }

        updateCharacterCount();

        showMessage("Languages swapped.", "success");
    });
}


// =============================================
// TRANSLATION HISTORY
// =============================================

function getHistory() {
    try {
        const history = JSON.parse(
            storageGet("translatorHistory", "[]")
        );

        return Array.isArray(history) ? history : [];

    } catch {
        return [];
    }
}

function saveHistory(
    source,
    result,
    sourceLang,
    targetLang
) {
    const history = getHistory();

    history.unshift({
        source: String(source),
        result: String(result),
        sourceLang: String(sourceLang),
        targetLang: String(targetLang),
        date: new Date().toLocaleString()
    });

    const saved = storageSet(
        "translatorHistory",
        JSON.stringify(history.slice(0, 50))
    );

    if (!saved) {
        console.warn("Translation history could not be saved.");
    }
}


// =============================================
// HTML SECURITY
// =============================================

function escapeHTML(value) {
    return String(value).replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]
    );
}


// =============================================
// RENDER HISTORY
// =============================================

function renderHistory() {
    const history = getHistory();
    const list = $("historyList");

    if (!list) return;

    if (!history.length) {
        list.innerHTML = `
            <div class="empty-history">
                No translations yet.
            </div>
        `;
        return;
    }

    list.innerHTML = history.map((item, index) => `
        <div class="history-item">

            <div>
                <small>
                    ${escapeHTML(item.sourceLang)}
                    → ${escapeHTML(item.targetLang)}
                    · ${escapeHTML(item.date)}
                </small>

                <p>${escapeHTML(item.source)}</p>
            </div>

            <div>
                <small>TRANSLATION</small>
                <p>${escapeHTML(item.result)}</p>
            </div>

            <div class="history-actions">
                <button data-copy="${index}">Copy</button>
                <button data-reuse="${index}">Reuse</button>
            </div>

        </div>
    `).join("");

    list.querySelectorAll("[data-copy]").forEach(button => {
        button.addEventListener("click", () => {
            const item =
                history[Number(button.dataset.copy)];

            if (item) copyText(item.result);
        });
    });

    list.querySelectorAll("[data-reuse]").forEach(button => {
        button.addEventListener("click", () => {
            const item =
                history[Number(button.dataset.reuse)];

            if (!item) return;

            $("sourceText").value = item.source;
            updateCharacterCount();

            if ($("resultText")) {
                $("resultText").textContent = item.result;
            }

            if ($("resultMeta")) {
                $("resultMeta").textContent =
                    `${item.result.length} characters`;
            }

            lastTranslation = item.result;

            const source = languages.find(
                lang => lang.name === item.sourceLang
            );

            const target = languages.find(
                lang => lang.name === item.targetLang
            );

            if (source && $("sourceLanguage")) {
                $("sourceLanguage").value = source.code;
            }

            if (target && $("targetLanguage")) {
                $("targetLanguage").value = target.code;
            }

            showPage("translator");

            showMessage(
                "History translation restored.",
                "success"
            );
        });
    });
}


// =============================================
// CLEAR HISTORY
// =============================================

if ($("clearHistory")) {
    $("clearHistory").addEventListener("click", () => {
        storageRemove("translatorHistory");

        renderHistory();

        showMessage("History cleared.", "success");
    });
}


// =============================================
// PAGE NAVIGATION
// =============================================

function showPage(pageName) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
    });

    const page = $(pageName);

    if (page) {
        page.classList.add("active");
    }

    const navButton = document.querySelector(
        `.nav-btn[data-page="${pageName}"]`
    );

    if (navButton) {
        navButton.classList.add("active");
    }

    $("navLinks")?.classList.remove("show");

    if (pageName === "history") {
        renderHistory();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", event => {
        event.preventDefault();

        showPage(button.dataset.page);
    });
});


// =============================================
// DARK / LIGHT MODE
// =============================================

function updateThemeIcon() {
    const dark =
        document.body.classList.contains("dark");

    const themeToggle = $("themeToggle");

    if (!themeToggle) return;

    themeToggle.innerHTML = dark
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';

    themeToggle.title = dark
        ? "Switch to Light Mode"
        : "Switch to Dark Mode";
}

function loadTheme() {
    const theme = storageGet("translatorTheme", "light");

    document.body.classList.toggle(
        "dark",
        theme === "dark"
    );

    updateThemeIcon();
}

if ($("themeToggle")) {
    $("themeToggle").addEventListener("click", () => {
        document.body.classList.toggle("dark");

        const dark =
            document.body.classList.contains("dark");

        storageSet(
            "translatorTheme",
            dark ? "dark" : "light"
        );

        updateThemeIcon();
    });
}


// =============================================
// MOBILE MENU
// =============================================

if ($("menuToggle")) {
    $("menuToggle").addEventListener("click", () => {
        $("navLinks")?.classList.toggle("show");
    });
}


// =============================================
// CLEANUP
// =============================================

window.addEventListener("beforeunload", () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    if (recognition) {
        recognition.stop();
    }

    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }
});


// =============================================
// START TRANSAI
// =============================================

loadTheme();
loadLanguages();
renderHistory();
updateCharacterCount();

console.log(
    "TransAI AI Translator initialized successfully."
);