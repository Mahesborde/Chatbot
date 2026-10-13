const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const messagesEl = document.querySelector("#messages");
const sendButton = document.querySelector("#send");
const newChatButton = document.querySelector("#new-chat");
const themeToggle = document.querySelector("#theme-toggle");
const suggestions = [
  "Explain a tricky idea in simple terms",
  "Help me brainstorm a creative project",
  "Write a short, friendly email asking to reschedule a meeting",
];

function showWelcome() {
  const welcome = document.createElement("div");
  welcome.id = "welcome";
  welcome.className = "welcome";
  const mark = document.createElement("span");
  mark.className = "welcome-mark";
  mark.textContent = "✳";
  const title = document.createElement("h1");
  title.textContent = "What can I help with?";
  const description = document.createElement("p");
  description.textContent = "Ask a question, explore an idea, or get something done.";
  const choices = document.createElement("div");
  choices.className = "suggestions";
  for (const suggestion of suggestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = suggestion === suggestions[0] ? "Explain something simply"
      : suggestion === suggestions[1] ? "Brainstorm ideas" : "Help me write";
    button.addEventListener("click", () => sendMessage(suggestion));
    choices.append(button);
  }
  welcome.append(mark, title, description, choices);
  messagesEl.append(welcome);
}

function addMessage(role, text, extraClass = "") {
  const row = document.createElement("article");
  row.className = `message ${role === "user" ? "user-message" : "assistant-message"} ${extraClass}`;
  if (role !== "user") {
    const icon = document.createElement("span");
    icon.className = "assistant-icon";
    icon.textContent = "✳";
    row.append(icon);
  }
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;
  row.append(content);
  messagesEl.append(row);
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return row;
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message || sendButton.disabled) return;
  document.querySelector("#welcome")?.remove();
  addMessage("user", message);
  promptInput.value = "";
  promptInput.style.height = "auto";
  sendButton.disabled = true;
  const pending = addMessage("assistant", "Thinking…", "pending");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not reach Gemini. Please try again.");
    pending.querySelector(".message-content").textContent = data.reply;
    pending.classList.remove("pending");
  } catch (error) {
    pending.querySelector(".message-content").textContent = error instanceof Error
      ? error.message : "Could not reach Gemini. Please try again.";
    pending.classList.add("error-message");
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(promptInput.value);
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

newChatButton.addEventListener("click", () => {
  messagesEl.replaceChildren();
  showWelcome();
  promptInput.focus();
});

const savedTheme = localStorage.getItem("gemini-chat-theme");
if (savedTheme === "dark") document.body.classList.add("dark");
themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("gemini-chat-theme", isDark ? "dark" : "light");
  themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  themeToggle.querySelector(".theme-label").textContent = isDark ? "Dark appearance" : "Light appearance";
});
if (savedTheme === "dark") themeToggle.querySelector(".theme-label").textContent = "Dark appearance";

showWelcome();
