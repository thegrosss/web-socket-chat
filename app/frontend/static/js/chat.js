let socket = null;
let currentChat = null;
let currentChatUser = null;
let currentUser = null;
let USER_ID = null;
let onlineUsers = new Set();
let typingTimer = null;
let isTyping = false;
let pendingAttachments = [];
let attachmentStatus = "";
let uploadProgress = null;
let searchTimer = null;

async function init() {
    await getMe();
    connectWS();
}

function getCookie(name) {
    const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
    return v ? v[2] : null;
}

function escapeHTML(value) {
    const symbols = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"};
    return String(value ?? "").replace(/[&<>"']/g, char => symbols[char]);
}

function formatUserName(user) {
    const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
    return fullName || (user?.username ? `@${user.username}` : "Пользователь");
}

function getInitials(user) {
    const first = (user?.first_name || "").trim();
    const last = (user?.last_name || "").trim();
    const username = (user?.username || "").trim();
    const initials = `${first[0] || ""}${last[0] || ""}` || username[0] || "U";
    return initials.toUpperCase();
}

function avatarMarkup(user, className = "avatar") {
    if (user?.avatar_url) {
        return `<div class="${className} has-image" style="background-image:url('${escapeHTML(user.avatar_url)}')"></div>`;
    }
    return `<div class="${className}">${escapeHTML(getInitials(user))}</div>`;
}

function renderAvatarInto(element, user, className = "avatar") {
    element.className = className;
    element.style.backgroundImage = "";
    element.textContent = "";

    if (user?.avatar_url) {
        element.classList.add("has-image");
        element.style.backgroundImage = `url('${user.avatar_url}')`;
        return;
    }

    element.classList.remove("has-image");
    element.textContent = getInitials(user);
}

function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseServerDate(value) {
    if (!value) return "";
    const raw = String(value);
    const hasTimeZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const date = new Date(hasTimeZone ? raw : `${raw}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatMessageTime(value) {
    const date = parseServerDate(value);
    if (!date) return "";
    return date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});
}

function getLocalDateKey(value) {
    const date = parseServerDate(value);
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDialogDate(value) {
    const date = parseServerDate(value);
    if (!date) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays === 0) return "Сегодня";
    if (diffDays === 1) return "Вчера";

    return date.toLocaleDateString("ru-RU", {day: "numeric", month: "long", year: "numeric"});
}

function formatDialogListDate(value) {
    const date = parseServerDate(value);
    if (!date) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays === 0) {
        return date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});
    }
    if (diffDays === 1) return "Вчера";
    if (date.getFullYear() === today.getFullYear()) {
        return date.toLocaleDateString("ru-RU", {day: "numeric", month: "short"});
    }

    return date.toLocaleDateString("ru-RU", {day: "2-digit", month: "2-digit", year: "2-digit"});
}

function ensureDateSeparator(value) {
    const key = getLocalDateKey(value);
    if (!key || document.getElementById(`date-${key}`)) return;

    const separator = document.createElement("div");
    separator.id = `date-${key}`;
    separator.className = "date-separator";
    separator.textContent = formatDialogDate(value);
    document.getElementById("messages").appendChild(separator);
}

function formatBirthDate(value) {
    if (!value) return "Не указана";
    return new Date(value).toLocaleDateString("ru-RU", {day: "2-digit", month: "long", year: "numeric"});
}

async function getMe() {
    try {
        const res = await fetch("/users/me");
        if (res.status === 401) {
            window.location.href = "/";
            return;
        }
        currentUser = await res.json();
        USER_ID = currentUser.id;
        await loadDialogs();
    } catch (e) {
        console.error(e);
    }
}

async function fetchOnlineUsers() {
    try {
        const res = await fetch("/ws/online_users");
        const data = await res.json();
        onlineUsers = new Set(data);
        updateStatusUI();
        await loadDialogs();
    } catch (e) {
        console.error(e);
    }
}

function connectWS() {
    const token = getCookie("access_token");
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${protocol}://${location.host}/ws/?token=${encodeURIComponent(token || "")}`);

    socket.onopen = () => {
        fetchOnlineUsers();
    };

    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.type === "new_message") {
            const msg = data.message;
            const isOpenChatMessage = msg.sender_id === currentChat || (msg.sender_id === USER_ID && currentChat === msg.receiver_id);
            if (isOpenChatMessage) {
                addMessage(msg);
                scrollToBottom();
            }
            loadDialogs();
        } else if (data.type === "online") {
            onlineUsers.add(data.user_id);
            updateStatusUI();
            loadDialogs();
        } else if (data.type === "offline") {
            onlineUsers.delete(data.user_id);
            updateStatusUI();
            loadDialogs();
        } else if (data.type === "typing") {
            if (data.sender_id === currentChat) {
                showTypingIndicator();
            }
        }
    };

    socket.onclose = () => {
        if (USER_ID) setTimeout(connectWS, 3000);
    };
}

function handleTyping() {
    if (!isTyping && socket && socket.readyState === WebSocket.OPEN && currentChat) {
        socket.send(JSON.stringify({type: "typing", receiver_id: currentChat}));
        isTyping = true;
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
    }, 2000);
}

function showTypingIndicator() {
    const statusEl = document.getElementById("chat-status");
    statusEl.textContent = "печатает...";
    statusEl.className = "chat-status typing";

    clearTimeout(window.typingIndicatorTimer);
    window.typingIndicatorTimer = setTimeout(() => updateStatusUI(), 2000);
}

function updateStatusUI() {
    if (!currentChat) return;
    const statusEl = document.getElementById("chat-status");

    if (onlineUsers.has(currentChat)) {
        statusEl.textContent = "в сети";
        statusEl.className = "chat-status online";
    } else {
        statusEl.textContent = "был(а) недавно";
        statusEl.className = "chat-status muted";
    }
}

async function loadDialogs() {
    const res = await fetch("/dialogs/");
    if (res.status === 401) {
        window.location.href = "/";
        return;
    }

    const data = await res.json();
    const container = document.getElementById("dialogs");
    container.innerHTML = "";

    if (!data.length) {
        container.innerHTML = `<div class="empty-list">Диалогов пока нет</div>`;
        return;
    }

    data.forEach(d => {
        const user = {
            id: d.user_id,
            first_name: d.first_name,
            last_name: d.last_name,
            username: d.username,
            avatar_url: d.avatar_url,
        };
        const div = document.createElement("button");
        div.type = "button";
        div.className = `dialog-item ${currentChat === d.user_id ? "active" : ""}`;
        div.onclick = () => openChat(user.id, user.first_name, user.last_name, user.avatar_url, user.username);

        const onlineBadge = onlineUsers.has(d.user_id) ? `<span class="online-dot"></span>` : "";
        const lastMessageDate = formatDialogListDate(d.last_message_created_at);
        div.innerHTML = `
            <span class="dialog-avatar-wrap">${avatarMarkup(user)}${onlineBadge}</span>
            <span class="dialog-body">
                <span class="dialog-top">
                    <span class="dialog-name">${escapeHTML(formatUserName(user))}</span>
                    <span class="dialog-date">${escapeHTML(lastMessageDate)}</span>
                </span>
                <span class="dialog-last">${escapeHTML(d.last_message || "")}</span>
            </span>
        `;
        container.appendChild(div);
    });
}

function openSearchModal() {
    const modal = document.getElementById("search-modal");
    modal.classList.remove("hidden-panel");
    document.getElementById("users").innerHTML = "";
    setTimeout(() => document.getElementById("person-search").focus(), 50);
}

function closeSearchModal() {
    document.getElementById("search-modal").classList.add("hidden-panel");
    document.getElementById("person-search").value = "";
    document.getElementById("users").innerHTML = "";
}

function searchUsers() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runUserSearch, 180);
}

async function runUserSearch() {
    const input = document.getElementById("person-search");
    const name = input.value.trim();
    const container = document.getElementById("users");

    if (!name) {
        container.innerHTML = "";
        return;
    }

    const res = await fetch("/users/search", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({first_name: name, last_name: ""})
    });
    const users = (await res.json()).filter(u => u.id !== USER_ID);

    container.innerHTML = "";
    if (!users.length) {
        container.innerHTML = `<div class="empty-list">Ничего не найдено</div>`;
        return;
    }

    users.forEach(u => {
        const el = document.createElement("div");
        el.className = "search-result";

        const openChatButton = document.createElement("button");
        openChatButton.type = "button";
        openChatButton.className = "search-result-main";
        openChatButton.innerHTML = `
            ${avatarMarkup(u)}
            <span class="search-result-copy">
                <span>${escapeHTML(formatUserName(u))}</span>
                <small>${u.username ? "@" + escapeHTML(u.username) : escapeHTML(u.email || "")}</small>
            </span>
        `;
        openChatButton.onclick = () => {
            closeSearchModal();
            openChat(u.id, u.first_name, u.last_name, u.avatar_url, u.username);
        };

        const profileButton = document.createElement("button");
        profileButton.type = "button";
        profileButton.className = "icon-button search-profile-button";
        profileButton.title = "Профиль";
        profileButton.setAttribute("aria-label", "Профиль");
        profileButton.innerHTML = `<i class="fas fa-id-card"></i>`;
        profileButton.onclick = () => viewUserProfile(u.id);

        el.appendChild(openChatButton);
        el.appendChild(profileButton);
        container.appendChild(el);
    });
}

async function openChat(id, firstName, lastName, avatarUrl = null, username = null) {
    currentChat = Number(id);
    currentChatUser = {
        id: currentChat,
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
        username,
    };
    pendingAttachments = [];
    renderAttachmentPreview();

    document.querySelector(".app-shell").classList.add("chat-open");
    document.getElementById("empty-chat").classList.add("hidden-panel");
    document.getElementById("chat-header").classList.remove("hidden-panel");
    document.getElementById("input-area").classList.remove("hidden-panel");

    await loadDialogs();

    const res = await fetch(`/dialogs/${id}/messages`);
    const data = await res.json();
    currentChatUser = data.user;
    renderChatHeader();
    updateStatusUI();

    const container = document.getElementById("messages");
    container.innerHTML = "";
    data.messages.forEach(addMessage);
    scrollToBottom();
}

function renderChatHeader() {
    document.getElementById("chat-title").textContent = formatUserName(currentChatUser);
    document.getElementById("chat-username").textContent = currentChatUser?.username ? `@${currentChatUser.username}` : "";
    renderAvatarInto(document.getElementById("chat-avatar"), currentChatUser, "avatar avatar-lg");
}

function closeMobileChat() {
    document.querySelector(".app-shell").classList.remove("chat-open");
}

function handleProfileKey(event, userId) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    viewUserProfile(userId);
}

async function viewUserProfile(userId) {
    if (!userId) return;

    const content = document.getElementById("user-profile-content");
    content.innerHTML = `<div class="empty-list">Загрузка...</div>`;
    document.getElementById("user-profile-modal").classList.remove("hidden-panel");

    try {
        const res = await fetch(`/users/${userId}`);
        if (res.status === 401) {
            window.location.href = "/";
            return;
        }

        const user = await res.json();
        if (!res.ok) throw new Error(user.detail || "Не удалось открыть профиль");
        renderPublicProfile(user);
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="empty-list">${escapeHTML(e.message)}</div>`;
    }
}

function renderPublicProfile(user) {
    const content = document.getElementById("user-profile-content");
    content.innerHTML = `
        <div class="public-profile-hero">
            ${avatarMarkup(user, "avatar avatar-xl")}
            <div class="public-profile-title">
                <h3>${escapeHTML(formatUserName(user))}</h3>
                <p>${user.username ? "@" + escapeHTML(user.username) : "Аккаунт не указан"}</p>
            </div>
        </div>
        <dl class="public-profile-details">
            <div>
                <dt>Дата рождения</dt>
                <dd>${escapeHTML(formatBirthDate(user.birth_date))}</dd>
            </div>
            <div>
                <dt>О себе</dt>
                <dd>${escapeHTML(user.bio || "Не указано")}</dd>
            </div>
        </dl>
    `;
}

function closeUserProfileModal() {
    document.getElementById("user-profile-modal").classList.add("hidden-panel");
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const isMe = m.sender_id === USER_ID;

    if (document.getElementById(`msg-${m.id}`)) return;
    ensureDateSeparator(m.created_at);

    const wrapper = document.createElement("article");
    wrapper.id = `msg-${m.id}`;
    wrapper.className = `message ${isMe ? "me" : "other"}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (m.content) {
        const text = document.createElement("p");
        text.className = "message-text";
        text.textContent = m.content;
        bubble.appendChild(text);
    }

    if (m.attachments?.length) {
        const attachments = document.createElement("div");
        attachments.className = "message-attachments";
        m.attachments.forEach(attachment => attachments.appendChild(createAttachmentElement(attachment)));
        bubble.appendChild(attachments);
    }

    const meta = document.createElement("span");
    meta.className = "message-time";
    meta.textContent = formatMessageTime(m.created_at);
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
}

function createAttachmentElement(attachment) {
    if (attachment.type === "image") {
        const link = document.createElement("a");
        link.className = "chat-image";
        link.href = attachment.url;
        link.target = "_blank";
        link.rel = "noopener";

        const image = document.createElement("img");
        image.src = attachment.url;
        image.alt = attachment.name || "image";
        image.loading = "lazy";
        link.appendChild(image);
        return link;
    }

    if (attachment.type === "video") {
        const video = document.createElement("video");
        video.className = "chat-video";
        video.src = attachment.url;
        video.controls = true;
        video.preload = "metadata";
        video.title = attachment.name || "Видео";
        return video;
    }

    const link = document.createElement("a");
    link.className = "chat-file";
    link.href = attachment.url;
    link.target = "_blank";
    link.rel = "noopener";

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.innerHTML = `<i class="fas fa-file"></i>`;

    const copy = document.createElement("span");
    copy.className = "file-copy";

    const name = document.createElement("strong");
    name.textContent = attachment.name || "Файл";

    const size = document.createElement("small");
    size.textContent = formatFileSize(attachment.size);

    copy.appendChild(name);
    copy.appendChild(size);
    link.appendChild(icon);
    link.appendChild(copy);
    return link;
}

function scrollToBottom() {
    const messages = document.getElementById("messages");
    messages.scrollTop = messages.scrollHeight;
}

async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(file => formData.append("files", file));

    try {
        attachmentStatus = "Загрузка...";
        uploadProgress = 0;
        renderAttachmentPreview();

        const data = await uploadFilesWithProgress(formData, percent => {
            uploadProgress = percent;
            attachmentStatus = `Загрузка ${percent}%`;
            renderAttachmentPreview();
        });

        pendingAttachments.push(...data.files);
    } catch (e) {
        console.error(e);
        alert(e.message);
    } finally {
        attachmentStatus = "";
        uploadProgress = null;
        renderAttachmentPreview();
    }
}

function uploadFilesWithProgress(formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/uploads/messages");

        xhr.upload.onprogress = event => {
            if (!event.lengthComputable) return;
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            onProgress(percent);
        };

        xhr.onload = () => {
            let data = {};
            try {
                data = JSON.parse(xhr.responseText || "{}");
            } catch (e) {
                reject(new Error("Не удалось прочитать ответ сервера"));
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(data);
                return;
            }

            reject(new Error(data.detail || "Не удалось загрузить файл"));
        };

        xhr.onerror = () => reject(new Error("Ошибка сети при загрузке файла"));
        xhr.send(formData);
    });
}

function renderAttachmentPreview() {
    const container = document.getElementById("attachment-preview");
    container.innerHTML = "";

    if (!pendingAttachments.length && !attachmentStatus) {
        container.classList.add("hidden-panel");
        return;
    }

    container.classList.remove("hidden-panel");

    pendingAttachments.forEach((attachment, index) => {
        const item = document.createElement("div");
        item.className = `preview-item ${attachment.type === "image" ? "image" : "file"}`;

        if (attachment.type === "image") {
            const image = document.createElement("img");
            image.src = attachment.url;
            image.alt = attachment.name || "image";
            item.appendChild(image);
        } else if (attachment.type === "video") {
            const icon = document.createElement("span");
            icon.className = "file-icon";
            icon.innerHTML = `<i class="fas fa-film"></i>`;
            item.appendChild(icon);
        } else {
            const icon = document.createElement("span");
            icon.className = "file-icon";
            icon.innerHTML = `<i class="fas fa-file"></i>`;
            item.appendChild(icon);
        }

        const copy = document.createElement("span");
        copy.className = "preview-copy";
        copy.textContent = attachment.name || "Файл";
        item.appendChild(copy);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "preview-remove";
        remove.title = "Убрать";
        remove.setAttribute("aria-label", "Убрать вложение");
        remove.innerHTML = `<i class="fas fa-xmark"></i>`;
        remove.onclick = () => removePendingAttachment(index);
        item.appendChild(remove);

        container.appendChild(item);
    });

    if (attachmentStatus) {
        const status = document.createElement("div");
        status.className = "preview-status";
        status.innerHTML = `
            <span>${escapeHTML(attachmentStatus)}</span>
            <span class="upload-progress">
                <span style="width:${uploadProgress ?? 0}%"></span>
            </span>
        `;
        container.appendChild(status);
    }
}

function removePendingAttachment(index) {
    pendingAttachments.splice(index, 1);
    renderAttachmentPreview();
}

function sendMessage() {
    const input = document.getElementById("message-input");
    const content = input.value.trim();
    if ((!content && !pendingAttachments.length) || !currentChat) return;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "message",
            receiver_id: currentChat,
            content,
            attachments: pendingAttachments
        }));
    }

    input.value = "";
    pendingAttachments = [];
    renderAttachmentPreview();
    autoResizeMessageInput();
}

function handleEnter(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResizeMessageInput() {
    const input = document.getElementById("message-input");
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function openProfileModal() {
    fillProfileForm();
    document.getElementById("profile-modal").classList.remove("hidden-panel");
}

function closeProfileModal() {
    document.getElementById("profile-modal").classList.add("hidden-panel");
}

function fillProfileForm() {
    if (!currentUser) return;
    document.getElementById("profile-first-name").value = currentUser.first_name || "";
    document.getElementById("profile-last-name").value = currentUser.last_name || "";
    document.getElementById("profile-username").value = currentUser.username || "";
    document.getElementById("profile-birth-date").value = currentUser.birth_date || "";
    document.getElementById("profile-bio").value = currentUser.bio || "";
    document.getElementById("profile-avatar-input").value = "";
    document.getElementById("profile-message").textContent = "";
    renderAvatarInto(document.getElementById("profile-avatar-preview"), currentUser, "avatar avatar-xl");
}

function previewProfileAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const preview = document.getElementById("profile-avatar-preview");
    preview.className = "avatar avatar-xl has-image";
    preview.textContent = "";
    preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
}

async function saveProfile(event) {
    event.preventDefault();

    const form = document.getElementById("profile-form");
    const formData = new FormData(form);
    formData.set("username", (formData.get("username") || "").toString().trim().replace(/^@/, ""));

    const message = document.getElementById("profile-message");
    message.textContent = "";
    message.className = "form-message";

    try {
        const res = await fetch("/users/me", {
            method: "PUT",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Не удалось сохранить профиль");

        currentUser = data;
        message.textContent = "Сохранено";
        message.className = "form-message success";
        renderAvatarInto(document.getElementById("profile-avatar-preview"), currentUser, "avatar avatar-xl");
        setTimeout(closeProfileModal, 500);
    } catch (e) {
        console.error(e);
        message.textContent = e.message;
        message.className = "form-message error";
    }
}

function closeModalOnBackdrop(event, modalId) {
    if (event.target.id !== modalId) return;
    if (modalId === "search-modal") closeSearchModal();
    if (modalId === "profile-modal") closeProfileModal();
    if (modalId === "user-profile-modal") closeUserProfileModal();
}

async function logout() {
    await fetch("/users/logout", {method: "POST"});
    window.location.href = "/";
}

init();
