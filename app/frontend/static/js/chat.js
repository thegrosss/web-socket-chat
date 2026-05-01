let socket = null;
let currentChat = null;
let USER_ID = null;
let onlineUsers = new Set();
let typingTimer = null;
let isTyping = false;

async function init() {
    await getMe();
    connectWS();
}

function getCookie(name) {
    const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return v ? v[2] : null;
}

async function getMe() {
    try {
        const res = await fetch("/users/me");
        if (res.status === 401) { window.location.href = "/"; return; }
        const data = await res.json();
        USER_ID = data.id;
        loadDialogs();
    } catch (e) {}
}

async function fetchOnlineUsers() {
    try {
        const res = await fetch("/ws/online_users");
        const data = await res.json();
        onlineUsers = new Set(data);
        updateStatusUI();
    } catch(e) {}
}

function connectWS() {
    const token = getCookie("access_token");
    socket = new WebSocket(`ws://${location.host}/ws/?token=${token}`);

    socket.onopen = () => {
        fetchOnlineUsers(); // Как только подключились - узнаем кто в сети
    };

    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.type === "new_message") {
            const msg = data.message;
            // Если сообщение от собеседника НАМ, или это наше сообщение, которое сервер успешно сохранил
            if (msg.sender_id === currentChat || (msg.sender_id === USER_ID && currentChat === msg.receiver_id)) {
                addMessage(msg);
                scrollToBottom();
            }
            loadDialogs(); // Обновляем список слева

        } else if (data.type === "online") {
            onlineUsers.add(data.user_id);
            updateStatusUI();
        } else if (data.type === "offline") {
            onlineUsers.delete(data.user_id);
            updateStatusUI();
        } else if (data.type === "typing") {
            if (data.sender_id === currentChat) {
                showTypingIndicator();
            }
        }
    };

    // Авто-переподключение, если интернет отпал
    socket.onclose = () => setTimeout(connectWS, 3000);
}

// === ЛОГИКА "ПЕЧАТАЕТ..." ===
function handleTyping() {
    if (!isTyping && socket && socket.readyState === WebSocket.OPEN && currentChat) {
        socket.send(JSON.stringify({ type: "typing", receiver_id: currentChat }));
        isTyping = true;
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { isTyping = false; }, 2000);
}

function showTypingIndicator() {
    const statusEl = document.getElementById("chat-status");
    statusEl.innerText = "печатает...";
    statusEl.className = "text-sm font-medium text-blue-500 transition-colors";

    clearTimeout(window.typingIndicatorTimer);
    window.typingIndicatorTimer = setTimeout(() => updateStatusUI(), 2000);
}

function updateStatusUI() {
    if (!currentChat) return;
    const statusEl = document.getElementById("chat-status");

    if (onlineUsers.has(currentChat)) {
        statusEl.innerText = "в сети";
        statusEl.className = "text-sm font-medium text-green-500 transition-colors";
    } else {
        statusEl.innerText = "был(а) недавно";
        statusEl.className = "text-sm font-medium text-gray-400 transition-colors";
    }
}
// ==============================

async function loadDialogs() {
    const res = await fetch("/dialogs/");
    const data = await res.json();
    const container = document.getElementById("dialogs");
    container.innerHTML = "";

    data.forEach(d => {
        const div = document.createElement("div");
        div.className = `p-3 border-b border-gray-100 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition ${currentChat === d.user_id ? 'bg-blue-50' : ''}`;
        div.onclick = () => openChat(d.user_id, d.first_name, d.last_name);

        // Индикатор сети в левом меню (зеленая точка)
        const isOnline = onlineUsers.has(d.user_id);
        const onlineBadge = isOnline ? `<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>` : '';

        const initial = d.first_name ? d.first_name[0].toUpperCase() : 'U';
        div.innerHTML = `
            <div class="relative w-12 h-12 bg-gradient-to-tr from-blue-400 to-blue-600 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                ${initial}
                ${onlineBadge}
            </div>
            <div class="flex-1 overflow-hidden">
                <div class="font-semibold text-gray-800 truncate">${d.first_name} ${d.last_name}</div>
                <div class="text-sm text-gray-500 truncate">${d.last_message || ''}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function searchUsers() {
    const name = document.getElementById("search").value;
    const container = document.getElementById("users");

    if (!name.trim()) {
        container.classList.add("hidden");
        return;
    }

    const res = await fetch("/users/search", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({first_name: name, last_name: ""})
    });
    const users = await res.json();

    container.innerHTML = "";
    if (users.length > 0) {
        container.classList.remove("hidden");
        users.forEach(u => {
            if (u.id === USER_ID) return;
            const el = document.createElement("div");
            el.className = "p-3 border-b hover:bg-gray-50 cursor-pointer flex items-center gap-3";
            el.innerHTML = `<div class="font-semibold text-gray-700">${u.first_name} ${u.last_name}</div>`;
            el.onclick = () => {
                document.getElementById("search").value = "";
                container.classList.add("hidden");
                openChat(u.id, u.first_name, u.last_name);
            };
            container.appendChild(el);
        });
    }
}

async function openChat(id, firstName, lastName) {
    currentChat = id;
    document.getElementById("empty-chat").style.display = "none";
    document.getElementById("chat-header").classList.remove("invisible");
    document.getElementById("input-area").classList.remove("invisible");

    loadDialogs();

    const res = await fetch(`/dialogs/${id}/messages`);
    const data = await res.json();

    const fName = firstName || data.user.first_name;
    const lName = lastName || data.user.last_name;
    document.getElementById("chat-title").innerText = `${fName} ${lName}`;
    document.getElementById("chat-avatar").innerText = fName[0].toUpperCase();

    updateStatusUI();

    const container = document.getElementById("messages");
    container.innerHTML = "";
    data.messages.forEach(addMessage);
    scrollToBottom();
}

function addMessage(m) {
    const container = document.getElementById("messages");
    const isMe = m.sender_id === USER_ID;

    // Проверка, чтобы не добавлять дубликаты (если вдруг прилетит два раза)
    if (document.getElementById(`msg-${m.id}`)) return;

    const div = document.createElement("div");
    div.id = `msg-${m.id}`;
    div.className = `max-w-[75%] px-4 py-2 rounded-2xl shadow-sm text-[15px] ${isMe ? 'bg-blue-500 text-white self-end rounded-br-sm' : 'bg-white text-gray-800 self-start rounded-bl-sm'}`;
    div.innerText = m.content;

    container.appendChild(div);
}

function scrollToBottom() {
    const messages = document.getElementById("messages");
    messages.scrollTop = messages.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById("message-input");
    const content = input.value.trim();
    if (!content || !currentChat) return;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "message",
            receiver_id: currentChat,
            content: content
        }));
    }
    input.value = "";
    // Убрали добавление сообщения здесь - ждем подтверждения от сервера!
}

function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

async function logout() {
    await fetch("/users/logout", {method: "POST"});
    window.location.href = "/";
}

init();
