
// =============================================
// TRANSAI - PREMIUM AI TRANSLATOR
// COMPLETE FRESH JAVASCRIPT
// Version 4.0
// =============================================

const $ = (id) => document.getElementById(id);

let languages = [];
let lastTranslation = "";
let cameraStream = null;
let recognition = null;


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
// FIXED [OBJECT OBJECT] ERROR
// =============================================

async function getResponse(response) {

    let data = {};

    try {
        data = await response.json();
    } catch {
        throw new Error(
            "Invalid server response. Please try again."
        );
    }

    if (!response.ok) {

        let errorMessage =
            "Something went wrong. Please try again.";

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

            if (Array.isArray(data.detail.errors)) {
                errorMessage +=
                    "\n" + data.detail.errors.join("\n");
            }

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

    if (typeof value === "object" && value !== null) {

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

        languages = data.languages || [];

        const source = $("sourceLanguage");
        const target = $("targetLanguage");

        if (!source || !target) return;

        source.innerHTML =
            '<option value="auto">Auto-detect</option>';

        target.innerHTML =
            '<option value="">Choose Language</option>';

        languages.forEach(language => {

            const option1 =
                document.createElement("option");

            option1.value = language.code;
            option1.textContent = language.name;

            source.appendChild(option1);

            const option2 =
                document.createElement("option");

            option2.value = language.code;
            option2.textContent = language.name;

            target.appendChild(option2);

        });

        target.value = "hi";

        showMessage("");

    } catch (error) {

        console.error("Language loading error:", error);

        showMessage(
            error.message,
            "error"
        );
    }
}


// =============================================
// CHARACTER COUNT
// =============================================

if ($("sourceText")) {

    $("sourceText").addEventListener("input", () => {

        const length = $("sourceText").value.length;

        if ($("charCount")) {
            $("charCount").textContent =
                `${length} / 5000`;
        }

    });

}


// =============================================
// TEXT TRANSLATION
// =============================================

async function translateText() {

    const text = $("sourceText").value.trim();

    const source = $("sourceLanguage").value;

    const target = $("targetLanguage").value;

    if (!text) {

        showMessage(
            "Please enter some text.",
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

    const button = $("translateBtn");

    button.disabled = true;

    button.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Translating...';

    showMessage("Translating your text...");

    try {

        const response = await fetch("/translate", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                text: text,

                source_language: source,

                target_language: target

            })

        });

        const data = await getResponse(response);

        lastTranslation = getTranslationText(data);

        $("resultText").textContent = lastTranslation;

        if ($("resultMeta")) {

            $("resultMeta").textContent =
                `${lastTranslation.length} characters`;

        }

        saveHistory(
            text,
            lastTranslation,
            $("sourceLanguage").selectedOptions[0].textContent,
            $("targetLanguage").selectedOptions[0].textContent
        );

        showMessage(
            "Translation completed successfully!",
            "success"
        );

    } catch (error) {

        console.error("Translation error:", error);

        showMessage(
            error.message,
            "error"
        );

    } finally {

        button.disabled = false;

        button.innerHTML =
            '<i class="fa-solid fa-language"></i> &nbsp; Translate <span>→</span>';

    }
}


if ($("translateBtn")) {

    $("translateBtn").addEventListener(
        "click",
        translateText
    );

}


if ($("sourceText")) {

    $("sourceText").addEventListener(
        "keydown",
        event => {

            if (
                event.ctrlKey &&
                event.key === "Enter"
            ) {
                translateText();
            }

        }
    );

}


// =============================================
// IMAGE TRANSLATION
// =============================================

async function translateImage(file) {

    if (!file) return;

    if (!file.type.startsWith("image/")) {

        showMessage(
            "Please select a valid image.",
            "error"
        );

        return;
    }

    const target = $("targetLanguage").value;

    if (!target) {

        showMessage(
            "Please choose a target language.",
            "error"
        );

        return;
    }

    const formData = new FormData();

    formData.append("file", file);

    formData.append(
        "target_language",
        target
    );

    formData.append(
        "source_language",
        $("sourceLanguage").value
    );

    showMessage("Extracting text from image...");

    try {

        const response = await fetch(
            "/translate-image",
            {
                method: "POST",
                body: formData
            }
        );

        const data = await getResponse(response);

        if (data.extracted_text) {

            $("sourceText").value =
                data.extracted_text;

            if ($("charCount")) {

                $("charCount").textContent =
                    `${data.extracted_text.length} / 5000`;

            }

        }

        lastTranslation = getTranslationText(data);

        $("resultText").textContent =
            lastTranslation;

        if ($("resultMeta")) {

            $("resultMeta").textContent =
                `${lastTranslation.length} characters`;

        }

        saveHistory(
            data.extracted_text || "",
            lastTranslation,
            $("sourceLanguage").selectedOptions[0].textContent,
            $("targetLanguage").selectedOptions[0].textContent
        );

        showMessage(
            "Image translated successfully!",
            "success"
        );

    } catch (error) {

        console.error("Image translation error:", error);

        showMessage(
            error.message,
            "error"
        );

    }

}


// =============================================
// IMAGE UPLOAD
// =============================================

if ($("uploadBtn")) {

    $("uploadBtn").addEventListener("click", () => {
        $("imageInput").click();
    });

}

if ($("multiUpload")) {

    $("multiUpload").addEventListener("click", () => {
        $("imageInput").click();
    });

}

if ($("imageInput")) {

    $("imageInput").addEventListener(
        "change",
        event => {

            const file = event.target.files[0];

            if (file) {
                translateImage(file);
            }

            event.target.value = "";

        }
    );

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

        $("cameraVideo").srcObject =
            cameraStream;

        $("cameraModal").classList.add("open");

        await $("cameraVideo").play();

    } catch (error) {

        console.error(error);

        showMessage(
            "Camera permission denied or camera unavailable.",
            "error"
        );

    }

}


function closeCamera() {

    if (cameraStream) {

        cameraStream.getTracks().forEach(
            track => track.stop()
        );

        cameraStream = null;

    }

    if ($("cameraVideo")) {
        $("cameraVideo").srcObject = null;
    }

    if ($("cameraModal")) {
        $("cameraModal").classList.remove("open");
    }

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

    $("captureBtn").addEventListener(
        "click",
        async () => {

            const video = $("cameraVideo");

            const canvas = $("cameraCanvas");

            if (!video.videoWidth) {

                showMessage(
                    "Camera is not ready.",
                    "error"
                );

                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");

            context.drawImage(
                video,
                0,
                0
            );

            const blob = await new Promise(resolve => {

                canvas.toBlob(
                    resolve,
                    "image/jpeg",
                    0.9
                );

            });

            closeCamera();

            if (blob) {

                const file = new File(
                    [blob],
                    "camera-image.jpg",
                    {
                        type: "image/jpeg"
                    }
                );

                translateImage(file);

            } else {

                showMessage(
                    "Unable to capture image.",
                    "error"
                );

            }

        }
    );

}


// =============================================
// SMART VOICE INPUT
// =============================================

function getVoiceLanguage() {

    const selected =
        $("sourceLanguage").value.toLowerCase();

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

    return voiceLanguages[selected] ||
        selected ||
        "en-IN";

}


function resetVoiceButton() {

    const voiceBtn = $("voiceBtn");

    if (voiceBtn) {

        voiceBtn.classList.remove("listening");

        voiceBtn.innerHTML =
            '<i class="fa-solid fa-microphone"></i> Voice';

    }

    recognition = null;

}


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

    const voiceBtn = $("voiceBtn");

    const sourceText = $("sourceText");

    if (!voiceBtn || !sourceText) return;

    if (recognition) {

        recognition.stop();

        return;
    }

    const currentRecognition =
        new SpeechRecognition();

    recognition = currentRecognition;

    currentRecognition.lang =
        getVoiceLanguage();

    currentRecognition.continuous = false;

    currentRecognition.interimResults = true;

    currentRecognition.maxAlternatives = 1;

    let finalTranscript = "";

    voiceBtn.classList.add("listening");

    voiceBtn.innerHTML =
        '<i class="fa-solid fa-microphone"></i> Listening...';

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

        sourceText.dispatchEvent(
            new Event("input", {
                bubbles: true
            })
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

        console.error(error);

        resetVoiceButton();

        showMessage(
            "Unable to start microphone. Please try again.",
            "error"
        );

    }

}


if ($("voiceBtn")) {

    $("voiceBtn").addEventListener(
        "click",
        startVoice
    );

}


if ($("multiVoice")) {

    $("multiVoice").addEventListener(
        "click",
        () => {

            showPage("translator");

            startVoice();

        }
    );

}


// =============================================
// LISTEN TO TRANSLATED TEXT
// =============================================

if ($("listenBtn")) {

    $("listenBtn").addEventListener(
        "click",
        () => {

            if (!lastTranslation) {

                showMessage(
                    "Nothing to listen to.",
                    "error"
                );

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

            const speech =
                new SpeechSynthesisUtterance(
                    lastTranslation
                );

            speech.lang =
                $("targetLanguage").value || "en";

            speech.rate = 0.95;

            speech.pitch = 1;

            speechSynthesis.speak(speech);

            showMessage(
                "Playing translated voice...",
                "success"
            );

        }
    );

}


// =============================================
// COPY TRANSLATION
// =============================================

async function copyText(text) {

    try {

        await navigator.clipboard.writeText(
            String(text)
        );

        showMessage(
            "Copied successfully!",
            "success"
        );

    } catch {

        showMessage(
            "Clipboard permission unavailable.",
            "error"
        );

    }

}


if ($("copyBtn")) {

    $("copyBtn").addEventListener(
        "click",
        () => {

            if (!lastTranslation) {

                showMessage(
                    "Nothing to copy.",
                    "error"
                );

                return;
            }

            copyText(lastTranslation);

        }
    );

}


// =============================================
// SWAP LANGUAGES
// =============================================

if ($("swapBtn")) {

    $("swapBtn").addEventListener(
        "click",
        () => {

            const source = $("sourceLanguage");

            const target = $("targetLanguage");

            if (
                source.value === "auto" ||
                !target.value
            ) {

                showMessage(
                    "Choose source and target languages first.",
                    "error"
                );

                return;
            }

            const oldSource = source.value;

            source.value = target.value;

            target.value = oldSource;

            if (lastTranslation) {

                $("sourceText").value =
                    lastTranslation;

                $("resultText").textContent =
                    "Your translated text will appear here...";

                lastTranslation = "";

                if ($("resultMeta")) {
                    $("resultMeta").textContent = "";
                }

            }

            if ($("charCount")) {

                $("charCount").textContent =
                    `${$("sourceText").value.length} / 5000`;

            }

            showMessage(
                "Languages swapped.",
                "success"
            );

        }
    );

}


// =============================================
// TRANSLATION HISTORY
// =============================================

function getHistory() {

    try {

        return JSON.parse(
            localStorage.getItem("translatorHistory") || "[]"
        );

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

    let history = getHistory();

    history.unshift({

        source: String(source),

        result: String(result),

        sourceLang: String(sourceLang),

        targetLang: String(targetLang),

        date: new Date().toLocaleString()

    });

    history = history.slice(0, 50);

    localStorage.setItem(
        "translatorHistory",
        JSON.stringify(history)
    );

}


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

    list.innerHTML = history.map(
        (item, index) => `

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

                <button data-copy="${index}">
                    Copy
                </button>

                <button data-reuse="${index}">
                    Reuse
                </button>

            </div>

        </div>

    `).join("");


    list.querySelectorAll("[data-copy]").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const item =
                        history[Number(button.dataset.copy)];

                    copyText(item.result);

                }
            );

        }
    );


    list.querySelectorAll("[data-reuse]").forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const item =
                        history[Number(button.dataset.reuse)];

                    $("sourceText").value =
                        item.source;

                    if ($("charCount")) {

                        $("charCount").textContent =
                            `${item.source.length} / 5000`;

                    }

                    $("resultText").textContent =
                        item.result;

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

                    if (source) {
                        $("sourceLanguage").value =
                            source.code;
                    }

                    if (target) {
                        $("targetLanguage").value =
                            target.code;
                    }

                    showPage("translator");

                    showMessage(
                        "History translation restored.",
                        "success"
                    );

                }
            );

        }
    );

}


if ($("clearHistory")) {

    $("clearHistory").addEventListener(
        "click",
        () => {

            localStorage.removeItem(
                "translatorHistory"
            );

            renderHistory();

            showMessage(
                "History cleared.",
                "success"
            );

        }
    );

}


// =============================================
// PAGE NAVIGATION
// =============================================

function showPage(pageName) {

    document.querySelectorAll(".page").forEach(
        page => {
            page.classList.remove("active");
        }
    );

    document.querySelectorAll(".nav-btn").forEach(
        button => {
            button.classList.remove("active");
        }
    );

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

    if ($("navLinks")) {
        $("navLinks").classList.remove("show");
    }

    if (pageName === "history") {
        renderHistory();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


document.querySelectorAll("[data-page]").forEach(
    button => {

        button.addEventListener(
            "click",
            event => {

                event.preventDefault();

                showPage(button.dataset.page);

            }
        );

    }
);


// =============================================
// DARK / LIGHT MODE
// =============================================

function updateThemeIcon() {

    const dark =
        document.body.classList.contains("dark");

    if (!$("themeToggle")) return;

    $("themeToggle").innerHTML = dark
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';

    $("themeToggle").title = dark
        ? "Switch to Light Mode"
        : "Switch to Dark Mode";

}


function loadTheme() {

    const theme =
        localStorage.getItem("translatorTheme");

    document.body.classList.toggle(
        "dark",
        theme === "dark"
    );

    updateThemeIcon();

}


if ($("themeToggle")) {

    $("themeToggle").addEventListener(
        "click",
        () => {

            document.body.classList.toggle("dark");

            const dark =
                document.body.classList.contains("dark");

            localStorage.setItem(
                "translatorTheme",
                dark ? "dark" : "light"
            );

            updateThemeIcon();

        }
    );

}


// =============================================
// MOBILE MENU
// =============================================

if ($("menuToggle")) {

    $("menuToggle").addEventListener(
        "click",
        () => {

            if ($("navLinks")) {
                $("navLinks").classList.toggle("show");
            }

        }
    );

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
// CLEANUP CAMERA AND VOICE
// =============================================

window.addEventListener(
    "beforeunload",
    () => {

        if (cameraStream) {

            cameraStream.getTracks().forEach(
                track => track.stop()
            );

        }

        if (recognition) {
            recognition.stop();
        }

        if (window.speechSynthesis) {
            speechSynthesis.cancel();
        }

    }
);


// =============================================
// START TRANSAI
// =============================================

loadTheme();

loadLanguages();

renderHistory();

console.log(
    "TransAI AI Translator initialized successfully."
);
