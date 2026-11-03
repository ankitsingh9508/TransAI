// =============================================
// VYRA AURORA - PREMIUM AI TRANSLATOR
// Complete Fresh JavaScript
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
    message.textContent = text;
    message.className = type;
}


// =============================================
// API RESPONSE HANDLER
// =============================================

async function getResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.detail || "Something went wrong. Please try again."
        );
    }

    return data;
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

        source.innerHTML =
            '<option value="auto">Auto-detect</option>';

        target.innerHTML =
            '<option value="">Choose Language</option>';

        languages.forEach(language => {
            const option1 = document.createElement("option");
            option1.value = language.code;
            option1.textContent = language.name;
            source.appendChild(option1);

            const option2 = document.createElement("option");
            option2.value = language.code;
            option2.textContent = language.name;
            target.appendChild(option2);
        });

        const hindi = languages.find(
            lang => lang.code.toLowerCase() === "hi"
        );

        if (hindi) {
            target.value = hindi.code;
        }

        showMessage("");

    } catch (error) {
        showMessage(
            "Cannot connect to backend. Start FastAPI and refresh.",
            "error"
        );
    }
}


// =============================================
// CHARACTER COUNT
// =============================================

$("sourceText").addEventListener("input", () => {
    const length = $("sourceText").value.length;
    $("charCount").textContent = `${length} / 5000`;
});


// =============================================
// TEXT TRANSLATION
// =============================================

async function translateText() {
    const text = $("sourceText").value.trim();
    const source = $("sourceLanguage").value;
    const target = $("targetLanguage").value;

    if (!text) {
        showMessage("Please enter some text.", "error");
        return;
    }

    if (!target) {
        showMessage("Please choose a target language.", "error");
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

        lastTranslation = data.translated_text;
        $("resultText").textContent = lastTranslation;

        $("resultMeta").textContent =
            `${lastTranslation.length} characters`;

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
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;

        button.innerHTML =
            '<i class="fa-solid fa-language"></i> &nbsp; Translate <span>→</span>';
    }
}

$("translateBtn").addEventListener("click", translateText);


// Ctrl + Enter shortcut

$("sourceText").addEventListener("keydown", event => {
    if (event.ctrlKey && event.key === "Enter") {
        translateText();
    }
});


// =============================================
// IMAGE TRANSLATION
// =============================================

async function translateImage(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showMessage("Please select a valid image.", "error");
        return;
    }

    const target = $("targetLanguage").value;

    if (!target) {
        showMessage("Please choose a target language.", "error");
        return;
    }

    const formData = new FormData();
    formData.append("image", file);
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

            $("charCount").textContent =
                `${data.extracted_text.length} / 5000`;
        }

        lastTranslation = data.translated_text;
        $("resultText").textContent = lastTranslation;

        $("resultMeta").textContent =
            `${lastTranslation.length} characters`;

        if (data.extracted_text) {
            saveHistory(
                data.extracted_text,
                data.translated_text,
                "Auto-detect",
                $("targetLanguage").selectedOptions[0].textContent
            );

            showMessage(
                "Image translated successfully!",
                "success"
            );

        } else {
            showMessage(
                "No readable text found in this image.",
                "error"
            );
        }

    } catch (error) {
        showMessage(error.message, "error");
    }
}


// =============================================
// IMAGE UPLOAD
// =============================================

$("uploadBtn").addEventListener("click", () => {
    $("imageInput").click();
});

$("multiUpload").addEventListener("click", () => {
    $("imageInput").click();
});

$("imageInput").addEventListener("change", event => {
    const file = event.target.files[0];

    if (file) {
        translateImage(file);
    }

    event.target.value = "";
});


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

        $("cameraVideo").srcObject = cameraStream;
        $("cameraModal").classList.add("open");

        await $("cameraVideo").play();

    } catch (error) {
        showMessage(
            "Camera permission denied or camera unavailable.",
            "error"
        );
    }
}


function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    $("cameraVideo").srcObject = null;
    $("cameraModal").classList.remove("open");
}


$("cameraBtn").addEventListener("click", openCamera);
$("multiCamera").addEventListener("click", openCamera);
$("closeCamera").addEventListener("click", closeCamera);


$("captureBtn").addEventListener("click", async () => {
    const video = $("cameraVideo");
    const canvas = $("cameraCanvas");

    if (!video.videoWidth) {
        showMessage("Camera is not ready.", "error");
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0);

    const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    closeCamera();

    if (blob) {
        const file = new File(
            [blob],
            "camera-image.jpg",
            { type: "image/jpeg" }
        );

        translateImage(file);

    } else {
        showMessage("Unable to capture image.", "error");
    }
});


// =============================================
// SMART VOICE INPUT
// =============================================

function getVoiceLanguage() {
    const selected = $("sourceLanguage").value.toLowerCase();

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

    return voiceLanguages[selected] || selected || "en-IN";
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
            "Voice input is not supported in this browser. Please use Chrome or Edge.",
            "error"
        );
        return;
    }

    const voiceBtn = $("voiceBtn");
    const sourceText = $("sourceText");
    const charCount = $("charCount");

    if (!voiceBtn || !sourceText) {
        console.error("Voice button or source text element not found.");
        return;
    }

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

    voiceBtn.classList.add("listening");
    voiceBtn.innerHTML =
        '<i class="fa-solid fa-microphone"></i> Listening...';

    showMessage("Listening... Speak now.");

    currentRecognition.onresult = (event) => {
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript;
            }
        }

        sourceText.value =
            (finalTranscript + interimTranscript).trim();

        if (charCount) {
            charCount.textContent =
                `${sourceText.value.length} / 5000`;
        }

        sourceText.dispatchEvent(
            new Event("input", { bubbles: true })
        );
    };

    currentRecognition.onerror = (event) => {
        const errors = {
            "not-allowed": "Microphone permission denied. Allow microphone access in Chrome.",
            "no-speech": "No speech detected. Please try speaking again.",
            "audio-capture": "No microphone found. Check your microphone connection.",
            "network": "Voice recognition network error. Check your internet connection.",
            "service-not-allowed": "Voice recognition service is blocked.",
            "language-not-supported": "This voice language is not supported by your browser."
        };

        showMessage(
            errors[event.error] || `Voice error: ${event.error}`,
            "error"
        );
    };

    currentRecognition.onend = () => {
        if (recognition === currentRecognition) {
            resetVoiceButton();
        }

        if (sourceText.value.trim()) {
            showMessage("Voice text added successfully.", "success");
        }
    };

    try {
        currentRecognition.start();

    } catch (error) {
        console.error("Unable to start voice recognition:", error);
        resetVoiceButton();

        showMessage(
            "Unable to start microphone. Please try again.",
            "error"
        );
    }
}


// =============================================
// VOICE BUTTON CLICK EVENTS
// =============================================

const voiceButton = $("voiceBtn");

if (voiceButton) {
    voiceButton.addEventListener("click", startVoice);
}

const multiVoiceButton = $("multiVoice");

if (multiVoiceButton) {
    multiVoiceButton.addEventListener("click", () => {
        showPage("translator");
        startVoice();
    });
}


// =============================================
// LISTEN TO TRANSLATED TEXT
// =============================================

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

    const speech = new SpeechSynthesisUtterance(lastTranslation);
    speech.lang = $("targetLanguage").value || "en";
    speech.rate = 0.95;
    speech.pitch = 1;

    speechSynthesis.speak(speech);

    showMessage("Playing translated voice...", "success");
});


// =============================================
// COPY TRANSLATION
// =============================================

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showMessage("Copied successfully!", "success");

    } catch {
        showMessage("Clipboard permission unavailable.", "error");
    }
}


$("copyBtn").addEventListener("click", () => {
    if (!lastTranslation) {
        showMessage("Nothing to copy.", "error");
        return;
    }

    copyText(lastTranslation);
});


// =============================================
// SWAP LANGUAGES
// =============================================

$("swapBtn").addEventListener("click", () => {
    const source = $("sourceLanguage");
    const target = $("targetLanguage");

    if (source.value === "auto" || !target.value) {
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
        $("sourceText").value = lastTranslation;

        $("resultText").innerHTML = `
            <div class="empty-state">
                <div>✦</div>
                <p>Your translated text will appear here...</p>
            </div>
        `;

        lastTranslation = "";
        $("resultMeta").textContent = "";
    }

    $("charCount").textContent =
        `${$("sourceText").value.length} / 5000`;

    showMessage("Languages swapped.", "success");
});


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


function saveHistory(source, result, sourceLang, targetLang) {
    let history = getHistory();

    history.unshift({
        source,
        result,
        sourceLang,
        targetLang,
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
                <button data-copy="${index}">
                    Copy
                </button>

                <button data-reuse="${index}">
                    Reuse
                </button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll("[data-copy]").forEach(button => {
        button.addEventListener("click", () => {
            const item = history[Number(button.dataset.copy)];
            copyText(item.result);
        });
    });

    list.querySelectorAll("[data-reuse]").forEach(button => {
        button.addEventListener("click", () => {
            const item = history[Number(button.dataset.reuse)];

            $("sourceText").value = item.source;

            $("charCount").textContent =
                `${item.source.length} / 5000`;

            $("resultText").textContent = item.result;

            $("resultMeta").textContent =
                `${item.result.length} characters`;

            lastTranslation = item.result;

            const source = languages.find(
                lang => lang.name === item.sourceLang
            );

            const target = languages.find(
                lang => lang.name === item.targetLang
            );

            if (source) {
                $("sourceLanguage").value = source.code;
            }

            if (target) {
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


$("clearHistory").addEventListener("click", () => {
    localStorage.removeItem("translatorHistory");

    renderHistory();

    showMessage("History cleared.", "success");
});


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

    $("navLinks").classList.remove("show");

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
// PREMIUM LIGHT / DARK MODE
// =============================================

function updateThemeIcon() {
    const dark = document.body.classList.contains("dark");

    $("themeToggle").innerHTML = dark
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';

    $("themeToggle").title = dark
        ? "Switch to Light Mode"
        : "Switch to Dark Mode";
}


function loadTheme() {
    const theme = localStorage.getItem("translatorTheme");

    document.body.classList.toggle(
        "dark",
        theme === "dark"
    );

    updateThemeIcon();
}


$("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const dark = document.body.classList.contains("dark");

    localStorage.setItem(
        "translatorTheme",
        dark ? "dark" : "light"
    );

    updateThemeIcon();
});


// =============================================
// MOBILE MENU
// =============================================

$("menuToggle").addEventListener("click", () => {
    $("navLinks").classList.toggle("show");
});


// =============================================
// HTML SECURITY
// =============================================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// =============================================
// CLEANUP CAMERA
// =============================================

window.addEventListener("beforeunload", () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }

    if (recognition) {
        recognition.stop();
    }

    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }
});


// =============================================
// START VYRA AURORA
// =============================================

loadTheme();
loadLanguages();
renderHistory();

console.log("VYRA Aurora AI Translator initialized successfully.");