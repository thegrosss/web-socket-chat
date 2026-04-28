const { roomId, username, userId } = window.CHAT_CONFIG;

let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let isConnected = false;
let messageQueue = [];

const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const connectionStatus = document.getElementById('connectionStatus');

function scrollToBottom() {
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

function addMessage(message, isSelf = false, isSystem = false) {
    const messageDiv = document.createElement('div');

    if (isSystem) {
        messageDiv.className = 'flex justify-center';
        messageDiv.innerHTML = `<div class="bg-blue-100 text-blue-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm">${message}</div>`;
    } else if (isSelf) {
        messageDiv.className = 'flex justify-end';
        messageDiv.innerHTML = `<div class="max-w-[75%] sm:max-w-xs lg:max-w-md"><div class="bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg rounded-br-none text-sm sm:text-base">${message}</div></div>`;
    } else {
        messageDiv.className = 'flex justify-start';
        messageDiv.innerHTML = `<div class="max-w-[75%] sm:max-w-xs lg:max-w-md"><div class="bg-white text-gray-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg rounded-bl-none shadow text-sm sm:text-base">${message}</div></div>`;
    }

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function updateConnectionStatus(status, color) {
    connectionStatus.textContent = status;
    connectionStatus.className = `px-2 py-1 text-xs sm:px-3 sm:py-1 sm:text-sm bg-${color}-100 text-${color}-800 rounded-full font-medium`;
}

function connectWebSocket() {
    // Формируем WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/chat/${roomId}/${userId}?username=${encodeURIComponent(username)}`;

    console.log('Подключение к:', wsUrl);

    try {
        ws = new WebSocket(wsUrl);
    } catch (error) {
        console.error('Ошибка создания WebSocket:', error);
        updateConnectionStatus('Ошибка', 'red');
        setTimeout(connectWebSocket, 3000);
        return;
    }

    ws.onopen = () => {
        console.log('WebSocket подключен');
        isConnected = true;
        updateConnectionStatus('Подключено', 'green');
        sendButton.disabled = false;
        messageInput.disabled = false;
        reconnectAttempts = 0;

        // Отправляем сообщения из очереди
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            ws.send(msg);
        }

        messageInput.focus();
    };

    ws.onmessage = (event) => {
        console.log('Получено сообщение:', event.data);
        try {
            const data = JSON.parse(event.data);

            if (data.message.includes('присоединился') || data.message.includes('покинул')) {
                addMessage(data.message, false, true);
            } else if (data.is_self) {
                addMessage(data.message, true, false);
                messageInput.value = '';
                sendButton.disabled = false;
                messageInput.focus();
            } else {
                addMessage(data.message, false, false);
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    };

    ws.onclose = (event) => {
        console.log('WebSocket отключен:', event.code, event.reason);
        isConnected = false;
        updateConnectionStatus('Отключено', 'red');
        sendButton.disabled = true;

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * reconnectAttempts, 5000);
            updateConnectionStatus('Переподключение...', 'yellow');
            setTimeout(connectWebSocket, delay);
        }
    };

    ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        updateConnectionStatus('Ошибка', 'red');
        sendButton.disabled = true;
    };
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();

    if (!message) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sendButton.disabled = true;
    } else if (!isConnected) {
        // Сохраняем в очередь, если нет подключения
        messageQueue.push(message);
        messageInput.value = '';
        addMessage('Сообщение будет отправлено после подключения...', true, true);
    }
});

// Обработка фокуса на мобильных устройствах
messageInput.addEventListener('focus', () => {
    setTimeout(scrollToBottom, 300);
});

function init() {
    messagesContainer.innerHTML = '';
    addMessage(`Добро пожаловать в комнату #${roomId}, ${username}!`, false, true);
    connectWebSocket();
    messageInput.focus();
}

window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Пользователь ушел');
    }
});

// Переподключение при возвращении на вкладку
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
        connectWebSocket();
    }
});

init();