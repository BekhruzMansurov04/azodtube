
const API = "/api";
const $ = id => document.getElementById(id);

let currentSection = "home";
let currentVideo = null;

async function api(url, options = {}) {
    const response = await fetch(API + url, {
        credentials: "same-origin",
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Xatolik yuz berdi");
    }

    return data;
}

function message(text) {
    $("status").textContent = text;
}

function openPanel(id) {
    $(id).classList.remove("hidden");
}

function closePanel(id) {
    $(id).classList.add("hidden");
}

// ACCOUNT
async function checkUser() {
    try {
        const data = await api("/me");

        $("userInfo").textContent =
            data.user ? "@" + data.user.username : "Mehmon";
    } catch {
        $("userInfo").textContent = "Mehmon";
    }
}

async function register() {
    try {
        await api("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: $("username").value,
                password: $("password").value
            })
        });

        alert("Akkaunt yaratildi!");
        closePanel("accountPanel");
        checkUser();
    } catch (e) {
        alert(e.message);
    }
}

async function login() {
    try {
        await api("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: $("username").value,
                password: $("password").value
            })
        });

        alert("Xush kelibsiz!");
        closePanel("accountPanel");
        checkUser();
    } catch (e) {
        alert(e.message);
    }
}

async function logout() {
    try {
        await api("/logout", { method: "POST" });
        alert("Akkauntdan chiqdingiz!");
        checkUser();
    } catch (e) {
        alert(e.message);
    }
}

// VIDEO CARD
function createCard(video) {
    const card = document.createElement("article");
    card.className = "video-card";

    const thumbnail = document.createElement("img");
    thumbnail.className = "thumbnail";
    thumbnail.loading = "lazy";
    thumbnail.alt = video.title;

    if (video.source === "youtube") {
        thumbnail.src = video.thumbnail;
    } else {
        thumbnail.src = "";
        thumbnail.style.display = "none";

        const preview = document.createElement("video");
        preview.className = "thumbnail";
        preview.src = video.url;
        preview.muted = true;
        preview.preload = "metadata";
        preview.playsInline = true;

        card.appendChild(preview);
    }

    if (video.source === "youtube") {
        card.appendChild(thumbnail);
    }

    const info = document.createElement("div");
    info.className = "video-info";

    const title = document.createElement("h3");
    title.textContent = video.title;

    const author = document.createElement("p");
    author.textContent = "@" + (video.username || "YouTube");

    const views = document.createElement("p");
    views.textContent =
        (video.views || 0) + " ko'rish";

    info.append(title, author, views);
    card.appendChild(info);

    card.addEventListener("click", () => openVideo(video));

    return card;
}

// RENDER
function renderVideos(local = [], youtube = []) {
    const container = $("videos");
    container.replaceChildren();

    const videos = [...local, ...youtube];

    container.classList.toggle(
        "shorts",
        currentSection === "shorts"
    );

    if (!videos.length) {
        container.textContent = "Videolar topilmadi.";
        return;
    }

    videos.forEach(video => {
        container.appendChild(createCard(video));
    });
}

// HOME
async function loadSection(section = "home") {
    currentSection = section;

    const names = {
        home: "Tavsiya etilgan videolar",
        gaming: "Gaming",
        music: "Musiqa",
        shorts: "Shorts",
        other: "Boshqa videolar"
    };

    $("sectionTitle").textContent = names[section] || section;

    document.querySelectorAll("[data-section]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === section
        );
    });

    message("Yuklanmoqda...");

    try {
        if (section === "home") {
            const [local, youtube] = await Promise.all([
                api("/videos"),
                api("/search?q=popular")
            ]);

            renderVideos(local, youtube.youtube || []);
        } else {
            const data = await api(
                "/search?category=" + encodeURIComponent(section)
            );

            renderVideos(data.local, data.youtube);
        }

        message("");
    } catch (e) {
        message(e.message);
    }
}

// SEARCH
async function searchVideos() {
    const q = $("searchInput").value.trim();

    if (!q) return loadSection(currentSection);

    message("Qidirilmoqda...");

    try {
        const data = await api(
            "/search?q=" + encodeURIComponent(q) +
            "&category=" +
            encodeURIComponent(currentSection === "home" ? "" : currentSection)
        );

        renderVideos(data.local, data.youtube);

        message(
            "AZODTUBE: " + data.local.length +
            " | YouTube: " + data.youtube.length
        );
    } catch (e) {
        message(e.message);
    }
}

// WATCH
async function openVideo(video) {
    currentVideo = video;

    openPanel("watchPanel");

    $("watchPlayer").replaceChildren();

    const player = document.createElement(
        video.source === "youtube" ? "iframe" : "video"
    );

    if (video.source === "youtube") {
        player.src = video.embedUrl + "?autoplay=1";
        player.allowFullscreen = true;
        player.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    } else {
        player.src = video.url;
        player.controls = true;
        player.autoplay = true;
    }

    $("watchPlayer").appendChild(player);

    $("watchTitle").textContent = video.title;
    $("watchAuthor").textContent = "@" + (video.username || "YouTube");
    $("watchDescription").textContent = video.description || "";

    const isLocal = video.source !== "youtube";

    $("likeButton").disabled = !isLocal;
    $("subscribeButton").disabled = !isLocal;
    $("commentButton").disabled = !isLocal;

    if (isLocal) {
        try {
            await api("/videos/" + video.id + "/view", {
                method: "POST"
            });

            await api("/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id })
            });

            await loadComments();
        } catch (e) {
            console.log(e.message);
        }

        $("likeCount").textContent =
            (video.likes || []).length;
    } else {
        $("likeCount").textContent = "YouTube";
        $("comments").textContent =
            "YouTube izohlari AZODTUBE ichida mavjud emas.";
    }

    $("subscribeButton").textContent = "Obuna bo'lish";
}

// LIKE
async function likeVideo() {
    if (!currentVideo || currentVideo.source === "youtube") return;

    try {
        const data = await api(
            "/videos/" + currentVideo.id + "/like",
            { method: "POST" }
        );

        $("likeCount").textContent = data.likes;
        $("likeButton").textContent =
            data.liked ? "👍 Liked" : "👍 Like";
    } catch (e) {
        alert(e.message);
    }
}

// COMMENTS
async function loadComments() {
    const comments = await api(
        "/videos/" + currentVideo.id + "/comments"
    );

    const container = $("comments");
    container.replaceChildren();

    comments.forEach(comment => {
        const p = document.createElement("p");
        p.textContent = "@" + comment.username + ": " + comment.text;
        container.appendChild(p);
    });
}

async function sendComment() {
    if (!currentVideo) return;

    const text = $("commentInput").value.trim();

    if (!text) return;

    try {
        await api("/videos/" + currentVideo.id + "/comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        $("commentInput").value = "";
        await loadComments();
    } catch (e) {
        alert(e.message);
    }
}

// SUBSCRIBE
async function subscribe() {
    if (!currentVideo || !currentVideo.userId) {
        alert("Kanal ma'lumoti topilmadi");
        return;
    }

    try {
        const data = await api(
            "/subscribe/" + currentVideo.userId,
            { method: "POST" }
        );

        $("subscribeButton").textContent =
            data.subscribed ? "Obuna bo'ldingiz ✓" : "Obunani bekor qilish";
    } catch (e) {
        alert(e.message);
    }
}

// UPLOAD
async function uploadVideo() {
    const file = $("videoFile").files[0];

    if (!file) {
        alert("Video tanlang!");
        return;
    }

    if (file.size > 200 * 1024 * 1024) {
        alert("Video 200 MB dan kichik bo'lishi kerak");
        return;
    }

    const form = new FormData();

    form.append("video", file);
    form.append("title", $("videoTitle").value);
    form.append("description", $("videoDescription").value);
    form.append("category", $("videoCategory").value);
    form.append("isShort", $("isShort").checked);

    try {
        message("Video yuklanmoqda...");

        await api("/videos", {
            method: "POST",
            body: form
        });

        alert("Video muvaffaqiyatli yuklandi!");

        $("videoTitle").value = "";
        $("videoDescription").value = "";
        $("videoFile").value = "";
        $("isShort").checked = false;

        closePanel("uploadPanel");

        loadSection(currentSection);
    } catch (e) {
        alert(e.message);
        message("");
    }
}

// HISTORY
async function showHistory() {
    try {
        const data = await api("/history");

        currentSection = "history";
        $("sectionTitle").textContent = "Ko'rilgan videolar";

        renderVideos(data, []);
    } catch (e) {
        alert(e.message);
    }
}

// EVENTS
document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
        loadSection(button.dataset.section);
    });
});

$("searchButton").onclick = searchVideos;

$("searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") searchVideos();
});

$("accountButton").onclick = () => openPanel("accountPanel");
$("accountSidebar").onclick = () => openPanel("accountPanel");

$("registerButton").onclick = register;
$("loginButton").onclick = login;
$("logoutButton").onclick = logout;

$("uploadOpenButton").onclick = () => openPanel("uploadPanel");
$("uploadSidebar").onclick = () => openPanel("uploadPanel");
$("uploadButton").onclick = uploadVideo;

$("likeButton").onclick = likeVideo;
$("commentButton").onclick = sendComment;
$("subscribeButton").onclick = subscribe;
$("historyButton").onclick = showHistory;

document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => closePanel(button.dataset.close);
});

$("menuButton").onclick = () => {
    $("sidebar").classList.toggle("closed");
    $("main").classList.toggle("expanded");
};

// START
checkUser();
loadSection("home");

