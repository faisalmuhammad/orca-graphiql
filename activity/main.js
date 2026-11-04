// src/activity/main.ts
var list = document.getElementById("sessions");
var error = document.getElementById("error");
var dialog = document.getElementById("rename-dialog");
var removeDialog = document.getElementById("remove-dialog");
var renameInput = document.getElementById("session-name");
var selected = null;
var removing = null;
var inFlight = false;
async function refresh(discover = false) {
  if (inFlight) return;
  inFlight = true;
  try {
    if (discover) {
      const result = await orca.plugin.request("activity.refresh");
      if (!result.ok) throw new Error(result.error.message);
    }
    const sessions = await orca.plugin.request("activity.list");
    list.replaceChildren();
    if (!sessions.length) {
      const empty = document.createElement("p");
      empty.textContent = "No GraphiQL sessions yet. Create or open a session to see activity here.";
      list.append(empty);
    }
    for (const item of sessions) render(item);
    error.textContent = "";
  } catch {
    error.textContent = "Unable to read session activity. Try Refresh.";
  } finally {
    inFlight = false;
  }
}
async function open(item) {
  error.textContent = "";
  try {
    const result = await orca.plugin.request("activity.open", { sessionId: item.sessionId });
    if (!result.ok) throw new Error(result.error.message);
    error.textContent = "";
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "Unable to open this session. Its file may have moved.";
  }
}
function iconButton(label, path) {
  const button = document.createElement("button");
  button.className = "icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  shape.setAttribute("fill", "none");
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-width", "1.7");
  shape.setAttribute("stroke-linecap", "round");
  shape.setAttribute("stroke-linejoin", "round");
  svg.append(shape);
  button.append(svg);
  return button;
}
function render(item) {
  const card = document.createElement("article");
  card.style.cursor = "pointer";
  card.addEventListener("click", (event) => {
    if (event.target instanceof Element && !event.target.closest("button")) void open(item);
  });
  const header = document.createElement("div");
  header.className = "item-header";
  const heading = document.createElement("h2");
  const name = document.createElement("button");
  name.className = "session-link";
  name.textContent = item.name || "Untitled session";
  name.title = item.file ? "Open " + item.file.path : "Locate and open this session";
  name.addEventListener("click", () => open(item));
  heading.append(name);
  const environment = document.createElement("p");
  environment.textContent = item.environment;
  const status = document.createElement("p");
  status.className = "status";
  status.textContent = item.status;
  const last = document.createElement("p");
  last.textContent = item.lastRun ? "Last execution: " + new Date(item.lastRun).toLocaleString() + (item.durationMs !== null ? " \xB7 " + item.durationMs + " ms" : "") : "No operations executed";
  const actions = document.createElement("div");
  actions.className = "actions";
  const rename = iconButton("Rename session", "M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3");
  rename.disabled = !item.editorId || item.readOnly;
  rename.title = item.readOnly ? "This session is read-only" : !item.editorId ? "Open the session to rename it" : "Rename session";
  rename.addEventListener("click", () => {
    selected = item;
    renameInput.value = item.name;
    dialog.showModal();
    renameInput.focus();
    renameInput.select();
  });
  const remove = iconButton("Remove from Explorer (keep file)", "M6 6l12 12 M18 6L6 18");
  remove.addEventListener("click", () => {
    removing = item;
    document.getElementById("remove-name").textContent = item.name || "Untitled session";
    removeDialog.showModal();
  });
  header.append(heading, rename, remove);
  for (const [action, label] of [["cancel", "Cancel request"], ["disconnect", "Disconnect"], ["refresh", "Refresh schema"]]) {
    if (action === "cancel" ? !item.busy : !item.connected) continue;
    const button = document.createElement("button");
    button.textContent = label;
    button.disabled = !item.editorId || (action === "cancel" ? !item.busy : !item.connected);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await orca.plugin.request("activity.control", { editorId: item.editorId, action });
        await refresh();
      } catch {
        error.textContent = "Unable to control this session. It may have closed.";
      }
    });
    actions.append(button);
  }
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = item.production ? "Production" : item.readOnly ? "Read-only" : "";
  if (badge.textContent) environment.append(" \xB7 ", badge);
  const endpoint = document.createElement("p");
  endpoint.className = "endpoint";
  endpoint.textContent = item.endpointHost || "";
  endpoint.title = item.endpointHost || "";
  const operation = document.createElement("p");
  operation.textContent = item.lastOperation ? item.lastOperation.kind.toUpperCase() + " \xB7 " + item.lastOperation.name : "";
  card.append(header, environment);
  if (endpoint.textContent) card.append(endpoint);
  card.append(status);
  if (operation.textContent) card.append(operation);
  card.append(last);
  if (actions.childElementCount) card.append(actions);
  list.append(card);
}
document.getElementById("rename-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const item = selected;
  if (!item) return;
  const button = document.getElementById("rename-submit");
  button.disabled = true;
  try {
    const result = await orca.plugin.request("activity.rename", { editorId: item.editorId, name: renameInput.value });
    if (!result.ok) throw new Error(result.error.message);
    dialog.close();
    await refresh();
  } catch (cause) {
    document.getElementById("rename-error").textContent = cause instanceof Error ? cause.message : "Unable to rename the session.";
  } finally {
    button.disabled = false;
  }
});
dialog.addEventListener("close", () => {
  selected = null;
  document.getElementById("rename-error").textContent = "";
});
document.getElementById("rename-cancel").addEventListener("click", () => dialog.close());
document.getElementById("remove-cancel").addEventListener("click", () => removeDialog.close());
removeDialog.addEventListener("close", () => {
  removing = null;
  document.getElementById("remove-error").textContent = "";
});
document.getElementById("remove-confirm").addEventListener("click", async () => {
  const item = removing;
  if (!item) return;
  const button = document.getElementById("remove-confirm");
  button.disabled = true;
  try {
    const result = await orca.plugin.request("activity.remove", { sessionId: item.sessionId });
    if (!result.ok) throw new Error(result.error.message);
    removeDialog.close();
    await refresh();
  } catch {
    document.getElementById("remove-error").textContent = "Unable to remove this Explorer entry. Try again.";
  } finally {
    button.disabled = false;
  }
});
document.getElementById("refresh").addEventListener("click", () => refresh(true));
document.getElementById("new-session").addEventListener("click", async () => {
  const button = document.getElementById("new-session");
  button.disabled = true;
  try {
    const result = await orca.plugin.request("sessions.workspaces");
    if (!result.ok) throw new Error(result.error.message);
    const select = document.getElementById("create-workspace");
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose workspace";
    select.append(placeholder);
    for (const workspace of result.value) {
      const option = document.createElement("option");
      option.value = workspace.id;
      option.textContent = workspace.name;
      select.append(option);
    }
    if (result.value.length === 1) select.value = result.value[0].id;
    if (!result.value.length) throw new Error("Open a local folder or worktree workspace in Orca first.");
    document.getElementById("create-dialog").showModal();
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "Unable to create the session.";
  } finally {
    button.disabled = false;
  }
});
var createDialog = document.getElementById("create-dialog");
document.getElementById("create-cancel").addEventListener("click", () => createDialog.close());
createDialog.addEventListener("close", () => {
  document.getElementById("create-error").textContent = "";
});
document.getElementById("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("create-submit");
  button.disabled = true;
  try {
    const result = await orca.plugin.request("sessions.create", { workspaceId: document.getElementById("create-workspace").value, filename: document.getElementById("create-filename").value });
    if (!result.ok) throw new Error(result.error.message);
    createDialog.close();
    await refresh();
    if (!result.value.opened) document.getElementById("creation-status").textContent = "Session created. " + (result.value.openError || "Click its Explorer entry to open it.");
  } catch (cause) {
    document.getElementById("create-error").textContent = cause instanceof Error ? cause.message : "Unable to create the session.";
  } finally {
    button.disabled = false;
  }
});
var subscription = orca.plugin.on("activity.changed", () => refresh());
window.addEventListener("pagehide", () => subscription.dispose());
void refresh(true);
