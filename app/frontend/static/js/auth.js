function showAuthMessage(message, type = "error") {
    const messageEl = document.getElementById("auth-message");
    if (!messageEl) return;
    messageEl.textContent = message || "";
    messageEl.className = `form-message ${type}`;
}

async function login(event) {
    if (event) event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        showAuthMessage("");
        const res = await fetch("/users/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email, password})
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Не удалось войти");

        window.location.href = "/chat";
    } catch (e) {
        console.error(e);
        showAuthMessage(e.message);
    }
}

async function register(event) {
    if (event) event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const first_name = document.getElementById("first_name").value.trim();
    const last_name = document.getElementById("last_name").value.trim();
    const usernameInput = document.getElementById("username");
    const username = usernameInput ? usernameInput.value.trim().replace(/^@/, "") : "";

    try {
        showAuthMessage("");
        const res = await fetch("/users/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email, password, first_name, last_name, username})
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Не удалось зарегистрироваться");

        showAuthMessage("Аккаунт создан", "success");
        setTimeout(() => window.location.href = "/", 450);
    } catch (e) {
        console.error(e);
        showAuthMessage(e.message);
    }
}

function goRegister() {
    window.location.href = "/register";
}

function goLogin() {
    window.location.href = "/";
}
