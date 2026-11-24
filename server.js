
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA = path.join(__dirname, "data");
const UPLOADS = path.join(__dirname, "uploads");

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const files = {
    users: path.join(DATA, "users.json"),
    videos: path.join(DATA, "videos.json"),
    comments: path.join(DATA, "comments.json"),
    subscriptions: path.join(DATA, "subscriptions.json")
};

for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "[]");
    }
}

function read(name) {
    try {
        return JSON.parse(fs.readFileSync(files[name], "utf8"));
    } catch {
        return [];
    }
}

function save(name, data) {
    fs.writeFileSync(files[name], JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));





app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Avval akkauntingizga kiring"
        });
    }
    next();
}

function currentUser(req) {
    return read("users").find(
        u => u.id === req.session.userId
    );
}

function safeUser(user) {
    return {
        id: user.id,
        username: user.username
    };
}

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({
                error: "Username 3-20 belgi bo'lsin"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "Parol kamida 8 ta belgi bo'lsin"
            });
        }

        const users = read("users");

        if (users.some(u =>
            u.username.toLowerCase() === username.toLowerCase()
        )) {
            return res.status(409).json({
                error: "Bu username band"
            });
        }

        const user = {
            id: crypto.randomUUID(),
            username,
            passwordHash: await bcrypt.hash(password, 12),
            createdAt: new Date().toISOString()
        };

        users.push(user);
        save("users", users);

        req.session.userId = user.id;

        res.json({
            success: true,
            user: safeUser(user)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Akkaunt yaratilmadi" });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        const user = read("users").find(
            u => u.username.toLowerCase() === username.toLowerCase()
        );

        if (!user || !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({
                error: "Username yoki parol noto'g'ri"
            });
        }

        req.session.userId = user.id;

        res.json({
            success: true,
            user: safeUser(user)
        });

    } catch (error) {
        res.status(500).json({ error: "Kirishda xatolik" });
    }
});

// CURRENT USER
app.get("/api/me", (req, res) => {
    const user = currentUser(req);

    res.json({
        user: user ? safeUser(user) : null
    });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
    });
});

// VIDEOS
app.get("/api/videos", (req, res) => {
    const videos = read("videos").slice().reverse();
    res.json(videos);
});

// SINGLE VIDEO
app.get("/api/videos/:id", (req, res) => {
    const video = read("videos").find(v => v.id === req.params.id);

    if (!video) {
        return res.status(404).json({ error: "Video topilmadi" });
    }

    res.json(video);
});

// YOUTUBE SEARCH + LOCAL SEARCH
app.get("/api/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const category = String(req.query.category || "").toLowerCase();

        const local = read("videos").filter(v => {
            const matchesCategory =
                !category ||
                (category === "shorts"
                    ? v.isShort
                    : v.category === category);

            const text = [
                v.title,
                v.description,
                v.username,
                v.category
            ].join(" ").toLowerCase();

            return matchesCategory &&
                (!q || text.includes(q.toLowerCase()));
        }).reverse();

        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey || !q && !category) {
            return res.json({ local, youtube: [] });
        }

        let searchText = q || "popular videos";

        if (category === "gaming") searchText += " gaming";
        if (category === "music") searchText += " music";
        if (category === "shorts") searchText += " #shorts";

       const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: searchText,
    maxResults: "12",
    order: "date",
    safeSearch: "strict",
    key: apiKey
});

        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/search?" + params
        );

        const data = await response.json();

        if (!response.ok) {
            console.error(data);
            return res.json({
                local,
                youtube: [],
                message: "YouTube qidiruv vaqtincha ishlamadi"
            });
        }

        const youtube = (data.items || []).map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.medium.url,
            username: item.snippet.channelTitle,
            source: "youtube",
            embedUrl: "https://www.youtube-nocookie.com/embed/" +
                item.id.videoId
        }));

        res.json({ local, youtube });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Qidiruvda xatolik" });
    }
});

// UPLOAD
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS),
    filename: (req, file, cb) => {
        cb(null, crypto.randomUUID() +
            path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("video/")) {
            cb(null, true);
        } else {
            cb(new Error("Faqat video yuklash mumkin"));
        }
    }
});

app.post("/api/videos", requireLogin, (req, res) => {
    upload.single("video")(req, res, error => {
        if (error) {
            return res.status(400).json({ error: error.message });
        }

        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "Video tanlanmagan"
                });
            }

            const title = String(req.body.title || "").trim();
            const category = String(req.body.category || "other");
            const description = String(req.body.description || "");

            if (!title || title.length > 150) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({
                    error: "Video nomini kiriting (150 belgigacha)"
                });
            }

            if (!["gaming", "music", "other"].includes(category)) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({
                    error: "Kategoriya noto'g'ri"
                });
            }

            const user = currentUser(req);

            if (!user) {
                fs.unlinkSync(req.file.path);
                return res.status(401).json({
                    error: "Akkaunt topilmadi"
                });
            }

            const video = {
                id: crypto.randomUUID(),
                title,
                description: description.slice(0, 5000),
                category,
                isShort: req.body.isShort === "true",
                username: user.username,
                userId: user.id,
                url: "/uploads/" + req.file.filename,
                likes: [],
                views: 0,
                createdAt: new Date().toISOString()
            };

            const videos = read("videos");
            videos.push(video);
            save("videos", videos);

            res.json({ success: true, video });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Video yuklanmadi" });
        }
    });
});

// LIKE
app.post("/api/videos/:id/like", requireLogin, (req, res) => {
    const videos = read("videos");
    const video = videos.find(v => v.id === req.params.id);

    if (!video) {
        return res.status(404).json({ error: "Video topilmadi" });
    }

    if (!Array.isArray(video.likes)) video.likes = [];

    const userId = req.session.userId;
    const index = video.likes.indexOf(userId);

    if (index === -1) {
        video.likes.push(userId);
    } else {
        video.likes.splice(index, 1);
    }

    save("videos", videos);

    res.json({
        liked: video.likes.includes(userId),
        likes: video.likes.length
    });
});

// VIEW
app.post("/api/videos/:id/view", (req, res) => {
    const videos = read("videos");
    const video = videos.find(v => v.id === req.params.id);

    if (!video) {
        return res.status(404).json({ error: "Video topilmadi" });
    }

    video.views = (video.views || 0) + 1;
    save("videos", videos);

    res.json({ views: video.views });
});

// COMMENTS
app.get("/api/videos/:id/comments", (req, res) => {
    const comments = read("comments").filter(
        c => c.videoId === req.params.id
    );

    res.json(comments);
});

app.post("/api/videos/:id/comments", requireLogin, (req, res) => {
    const video = read("videos").find(
        v => v.id === req.params.id
    );

    if (!video) {
        return res.status(404).json({ error: "Video topilmadi" });
    }

    const text = String(req.body.text || "").trim();

    if (!text || text.length > 1000) {
        return res.status(400).json({
            error: "Izoh 1-1000 belgi bo'lsin"
        });
    }

    const user = currentUser(req);

    const comment = {
        id: crypto.randomUUID(),
        videoId: video.id,
        userId: user.id,
        username: user.username,
        text,
        createdAt: new Date().toISOString()
    };

    const comments = read("comments");
    comments.push(comment);
    save("comments", comments);

    res.json({ success: true, comment });
});

// SUBSCRIBE
app.post("/api/subscribe/:userId", requireLogin, (req, res) => {
    const targetId = req.params.userId;
    const myId = req.session.userId;

    if (targetId === myId) {
        return res.status(400).json({
            error: "O'zingizga obuna bo'la olmaysiz"
        });
    }

    if (!read("users").some(u => u.id === targetId)) {
        return res.status(404).json({ error: "Kanal topilmadi" });
    }

    const subscriptions = read("subscriptions");

    const index = subscriptions.findIndex(
        s => s.userId === myId && s.targetId === targetId
    );

    if (index >= 0) {
        subscriptions.splice(index, 1);
    } else {
        subscriptions.push({ userId: myId, targetId });
    }

    save("subscriptions", subscriptions);

    res.json({
        subscribed: index < 0
    });
});

// CHANNEL
app.get("/api/channel/:username", (req, res) => {
    const user = read("users").find(
        u => u.username.toLowerCase() ===
            req.params.username.toLowerCase()
    );

    if (!user) {
        return res.status(404).json({ error: "Kanal topilmadi" });
    }

    const videos = read("videos").filter(
        v => v.userId === user.id
    );

    const subscriptions = read("subscriptions");

    res.json({
        user: safeUser(user),
        videos,
        subscribers: subscriptions.filter(
            s => s.targetId === user.id
        ).length
    });
});

// HISTORY
app.post("/api/history", requireLogin, (req, res) => {
    const id = String(req.body.videoId || "");
    const history = read("history");

    history.push({
        userId: req.session.userId,
        videoId: id,
        createdAt: new Date().toISOString()
    });

    if (!files.history) {
        files.history = path.join(DATA, "history.json");
    }

    save("history", history);
    res.json({ success: true });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) return next(error);

    res.status(500).json({
        error: "Server xatosi"
    });
});

app.listen(PORT, () => {
    console.log("AZODTUBE ishga tushdi!");
    console.log(`http://localhost:${PORT}`);
});


files.history = path.join(DATA, "history.json");

if (!fs.existsSync(files.history)) {
    fs.writeFileSync(files.history, "[]");
}

app.get("/api/history", requireLogin, (req, res) => {
    const history = read("history")
        .filter(h => h.userId === req.session.userId)
        .reverse();

    const videos = read("videos");

    res.json(
        history
            .map(h => videos.find(v => v.id === h.videoId))
            .filter(Boolean)
    );
});