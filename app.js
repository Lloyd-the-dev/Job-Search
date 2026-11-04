const DATABASE_NAME = "job-search-tracker";
const DATABASE_VERSION = 1;
const STORE_NAME = "applications";
const DAILY_GOAL = 20;

const form = document.querySelector("#application-form");
const companyInput = document.querySelector("#company");
const appliedDateInput = document.querySelector("#applied-date");
const statusMessage = document.querySelector("#form-status");
const applicationList = document.querySelector("#application-list");
const emptyState = document.querySelector("#empty-state");
const searchInput = document.querySelector("#history-search");
const todayCount = document.querySelector("#today-count");
const goalBadge = document.querySelector("#goal-badge");
const goalProgress = document.querySelector("#goal-progress");
const goalMessage = document.querySelector("#goal-message");
const totalCount = document.querySelector("#total-count");
const todayLabel = document.querySelector("#today-label");

let database;
let applications = [];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("appliedDate", "appliedDate");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open application storage."));
    request.onblocked = () => reject(new Error("Application storage is blocked by another open tracker tab."));
  });
}

function getAllApplications() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read application history."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not read application history."));
  });
}

function saveApplication(application) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(application);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save this application."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not save this application."));
  });
}

function removeApplication(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete this application."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not delete this application."));
  });
}

function isSafeJobUrl(value) {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderProgress() {
  const today = localDateString();
  const count = applications.filter((application) => application.appliedDate === today).length;
  const reachedGoal = count >= DAILY_GOAL;

  todayCount.textContent = String(count);
  goalBadge.textContent = `${count} / ${DAILY_GOAL}`;
  goalProgress.value = Math.min(count, DAILY_GOAL);
  goalMessage.textContent = reachedGoal
    ? `Daily goal reached! You’ve applied to ${count} ${count === 1 ? "job" : "jobs"} today.`
    : `${DAILY_GOAL - count} more ${DAILY_GOAL - count === 1 ? "application" : "applications"} to reach your daily goal.`;
  goalBadge.classList.toggle("goal-complete", reachedGoal);
}

function renderApplication(application) {
  const card = makeElement("article", "application-card");
  const details = makeElement("div", "application-details");
  const company = makeElement("h3", "application-company", application.company);
  details.append(company);

  if (application.role) {
    details.append(makeElement("p", "application-role", application.role));
  }

  const meta = makeElement("p", "application-meta");
  meta.append(document.createTextNode(formatDate(application.appliedDate)));
  if (application.jobUrl) {
    meta.append(document.createTextNode(" · "));
    const link = makeElement("a", "application-link", "Job listing");
    link.href = application.jobUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    meta.append(link);
  }
  details.append(meta);

  if (application.notes) {
    details.append(makeElement("p", "application-notes", application.notes));
  }

  const deleteButton = makeElement("button", "delete-button", "Delete");
  deleteButton.type = "button";
  deleteButton.setAttribute("aria-label", `Delete application at ${application.company}`);
  deleteButton.addEventListener("click", async () => {
    try {
      await removeApplication(application.id);
      await refreshApplications();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  card.append(details, deleteButton);
  return card;
}

function renderHistory() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = applications.filter((application) => {
    const searchableText = `${application.company} ${application.role}`.toLocaleLowerCase();
    return searchableText.includes(query);
  });

  applicationList.replaceChildren(...filtered.map(renderApplication));
  emptyState.hidden = filtered.length !== 0;
  if (applications.length === 0) {
    emptyState.textContent = "Your applications will show up here. Add the first one to get started.";
  } else if (filtered.length === 0) {
    emptyState.textContent = "No applications match your search.";
  }
  totalCount.textContent = `${applications.length} ${applications.length === 1 ? "application" : "applications"}`;
  renderProgress();
}

async function refreshApplications() {
  applications = await getAllApplications();
  applications.sort((first, second) =>
    second.appliedDate.localeCompare(first.appliedDate)
      || second.createdAt.localeCompare(first.createdAt),
  );
  renderHistory();
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const application = {
    id: crypto.randomUUID(),
    company: String(formData.get("company")).trim(),
    role: String(formData.get("role")).trim(),
    appliedDate: String(formData.get("appliedDate")),
    jobUrl: String(formData.get("jobUrl")).trim(),
    notes: String(formData.get("notes")).trim(),
    createdAt: new Date().toISOString(),
  };

  if (!application.company || !application.appliedDate) {
    showStatus("Please enter a company and application date.", true);
    return;
  }
  if (!isSafeJobUrl(application.jobUrl)) {
    showStatus("Please enter a job link starting with http:// or https://.", true);
    return;
  }

  try {
    await saveApplication(application);
    await refreshApplications();
    form.reset();
    appliedDateInput.value = localDateString();
    companyInput.focus();

    const count = applications.filter((item) => item.appliedDate === localDateString()).length;
    showStatus(
      count === DAILY_GOAL
        ? "That’s 20 applications today — you’ve reached your daily goal!"
        : `${application.company} added to your history.`,
    );
  } catch (error) {
    showStatus(error.message, true);
  }
});

searchInput.addEventListener("input", renderHistory);

todayLabel.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());
appliedDateInput.value = localDateString();

openDatabase()
  .then(async (openedDatabase) => {
    database = openedDatabase;
    await refreshApplications();
  })
  .catch((error) => {
    showStatus(error.message, true);
    emptyState.textContent = "Application history is unavailable until browser storage can be opened.";
  });
