async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/users/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email, password})
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || "Login failed");
        }

        // ✅ ВАЖНО: cookie уже установлен сервером
        window.location.href = "/chat";

    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

async function register() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const first_name = document.getElementById("first_name").value;
    const last_name = document.getElementById("last_name").value;

    try {
        const res = await fetch("/users/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email, password, first_name, last_name})
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || "Register failed");
        }

        alert("Registered successfully");
        window.location.href = "/";

    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

function goRegister() {
    window.location.href = "/register";
}

function goLogin() {
    window.location.href = "/";
}