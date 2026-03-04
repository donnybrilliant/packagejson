const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const treeRoot = document.getElementById("tree-root");
const recentLinksContainer = document.getElementById("recent-links");
const selectedPathLabel = document.getElementById("selected-path");
const previewPath = document.getElementById("preview-path");
const previewContent = document.getElementById("preview-content");
const reloadBtn = document.getElementById("reload-btn");
const clearBtn = document.getElementById("clear-btn");
const statusBadge = document.getElementById("status-badge");
const responseTime = document.getElementById("response-time");

const state = {
  selectedPath: "",
  selectedLabel: "",
  history: [],
  rootNodeId: "",
  selectedNodeId: "",
  nodeMap: new Map(),
  collapsedNodeIds: new Set(),
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isContainer = (value) =>
  typeof value === "object" && value !== null;

const getValueType = (value) => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value === "object") return "object";
  return typeof value;
};

const truncate = (value, maxLength = 36) => {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
};

const getNodeMeta = (node) => {
  if (node.type === "object") return `{${node.childIds.length}}`;
  if (node.type === "array") return `[${node.childIds.length}]`;
  if (node.type === "string") return `\"${truncate(node.value)}\"`;
  if (node.type === "null") return "null";
  return String(node.value);
};

const getNodeIcon = (node, isCollapsed) => {
  if (node.type === "object") return isCollapsed ? "[+]" : "[-]";
  if (node.type === "array") return isCollapsed ? "[+]" : "[-]";
  if (node.type === "string") return "[txt]";
  if (node.type === "number") return "[num]";
  if (node.type === "boolean") return "[bool]";
  if (node.type === "null") return "[nil]";
  return "[val]";
};

const setStatus = (text, type = "info") => {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${type}`;
};

const resetStatus = () => {
  statusBadge.textContent = "";
  statusBadge.className = "status-badge";
  responseTime.textContent = "";
};

const setActiveLink = (path) => {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === path;
    link.classList.toggle("active", isActive);
  });
};

const pushToHistory = (path, label) => {
  state.history = state.history.filter((entry) => entry.path !== path);
  state.history.unshift({ path, label });
  state.history = state.history.slice(0, 8);
};

const resetPreview = (message, selected = "No file selected") => {
  previewPath.textContent = selected;
  previewContent.innerHTML = `<code>${escapeHtml(message)}</code>`;
};

const renderTreePlaceholder = () => {
  treeRoot.innerHTML =
    '<p class="placeholder">Click any quick link to load response files.</p>';
};

const getPointerPath = (node) => {
  if (!node.pointer) return state.selectedPath || "/";
  return `${state.selectedPath}${node.pointer}`;
};

const renderPreview = () => {
  const node = state.nodeMap.get(state.selectedNodeId);
  if (!node) {
    resetPreview("Select a node to inspect its value.");
    return;
  }

  previewPath.textContent = getPointerPath(node);

  const value = isContainer(node.value)
    ? JSON.stringify(node.value, null, 2)
    : String(node.value);

  previewContent.innerHTML = `<code>${escapeHtml(value)}</code>`;
};

const buildTreeFromPayload = (payload) => {
  const nodeMap = new Map();
  let nodeCount = 0;

  const createNode = (name, value, depth, parentId, pointer) => {
    const id = `node-${nodeCount++}`;
    const type = getValueType(value);

    const node = {
      id,
      name,
      value,
      type,
      depth,
      parentId,
      pointer,
      childIds: [],
    };

    nodeMap.set(id, node);

    if (type === "object") {
      Object.entries(value).forEach(([key, childValue]) => {
        const escapedKey = key.replace(/~/g, "~0").replace(/\//g, "~1");
        const childId = createNode(
          key,
          childValue,
          depth + 1,
          id,
          `${pointer}/${escapedKey}`
        );
        node.childIds.push(childId);
      });
    }

    if (type === "array") {
      value.forEach((childValue, index) => {
        const childId = createNode(
          `[${index}]`,
          childValue,
          depth + 1,
          id,
          `${pointer}/${index}`
        );
        node.childIds.push(childId);
      });
    }

    return id;
  };

  const rootName = state.selectedLabel
    ? `${state.selectedLabel}.json`
    : "response.json";
  const rootNodeId = createNode(rootName, payload, 0, null, "");

  state.nodeMap = nodeMap;
  state.rootNodeId = rootNodeId;
  state.selectedNodeId = rootNodeId;

  state.collapsedNodeIds = new Set(
    Array.from(nodeMap.values())
      .filter((node) => node.depth > 1 && node.childIds.length > 0)
      .map((node) => node.id)
  );
};

const renderTree = () => {
  const rootNode = state.nodeMap.get(state.rootNodeId);
  if (!rootNode) {
    renderTreePlaceholder();
    return;
  }

  const rows = [];

  const renderNode = (nodeId) => {
    const node = state.nodeMap.get(nodeId);
    if (!node) return;

    const hasChildren = node.childIds.length > 0;
    const isCollapsed = state.collapsedNodeIds.has(node.id);
    const isSelected = state.selectedNodeId === node.id;

    rows.push(`
      <div class="tree-row" style="--depth:${node.depth}">
        ${
          hasChildren
            ? `<button class="tree-toggle" type="button" data-action="toggle" data-node="${node.id}" aria-label="Toggle ${escapeHtml(node.name)}">${isCollapsed ? "+" : "-"}</button>`
            : '<span class="tree-toggle-spacer"></span>'
        }
        <button class="tree-node ${isSelected ? "active" : ""}" type="button" data-action="select" data-node="${node.id}">
          <span class="node-icon">${getNodeIcon(node, isCollapsed)}</span>
          <span class="node-name">${escapeHtml(node.name)}</span>
          <span class="node-meta">${escapeHtml(getNodeMeta(node))}</span>
        </button>
      </div>
    `);

    if (hasChildren && !isCollapsed) {
      node.childIds.forEach(renderNode);
    }
  };

  renderNode(rootNode.id);
  treeRoot.innerHTML = `<div class="tree-list">${rows.join("")}</div>`;
};

const renderRecentLinks = () => {
  const entries = state.history.filter((entry) => entry.path !== state.selectedPath);

  if (!entries.length) {
    recentLinksContainer.innerHTML = "";
    return;
  }

  const buttons = entries
    .map(
      (entry) =>
        `<button class="recent-link" type="button" data-path="${encodeURIComponent(entry.path)}">${escapeHtml(entry.label)}</button>`
    )
    .join("");

  recentLinksContainer.innerHTML = `<p>Recent</p>${buttons}`;
};

const hydrateExplorerFromPayload = (payload) => {
  buildTreeFromPayload(payload);
  renderTree();
  renderPreview();
};

const fetchEndpoint = async (path) => {
  setStatus("Loading", "info");

  const startTime = performance.now();

  try {
    const response = await fetch(path, {
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    setStatus(
      `${response.status} ${response.statusText}`,
      response.ok ? "success" : "error"
    );
    responseTime.textContent = `${elapsed} ms`;

    hydrateExplorerFromPayload(payload);
  } catch (error) {
    setStatus("Request failed", "error");
    responseTime.textContent = "";

    hydrateExplorerFromPayload({
      error: error instanceof Error ? error.message : "Unknown error",
      endpoint: path,
    });
  }
};

const selectQuickLink = async (path, label) => {
  state.selectedPath = path;
  state.selectedLabel = label;
  selectedPathLabel.textContent = path;

  pushToHistory(path, label);
  setActiveLink(path);
  renderRecentLinks();

  reloadBtn.disabled = false;
  await fetchEndpoint(path);
};

const clearSelection = () => {
  state.selectedPath = "";
  state.selectedLabel = "";
  state.history = [];
  state.rootNodeId = "";
  state.selectedNodeId = "";
  state.nodeMap = new Map();
  state.collapsedNodeIds = new Set();

  selectedPathLabel.textContent = "No endpoint selected";
  reloadBtn.disabled = true;

  setActiveLink("");
  renderTreePlaceholder();
  recentLinksContainer.innerHTML = "";
  resetStatus();
  resetPreview(
    "Select a quick link, then click any node to inspect its value."
  );
};

navLinks.forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();

    const path = link.getAttribute("href") || "";
    const label = (link.textContent || path).trim();

    await selectQuickLink(path, label);
  });
});

treeRoot.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) return;

  const actionElement = target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) return;

  const action = actionElement.dataset.action;
  const nodeId = actionElement.dataset.node;
  if (!action || !nodeId || !state.nodeMap.has(nodeId)) return;

  if (action === "toggle") {
    if (state.collapsedNodeIds.has(nodeId)) {
      state.collapsedNodeIds.delete(nodeId);
    } else {
      state.collapsedNodeIds.add(nodeId);
    }
    renderTree();
    return;
  }

  if (action === "select") {
    state.selectedNodeId = nodeId;
    renderTree();
    renderPreview();
  }
});

recentLinksContainer.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const recentLink = target.closest(".recent-link");
  if (!(recentLink instanceof HTMLButtonElement)) return;

  const encodedPath = recentLink.dataset.path || "";
  const path = decodeURIComponent(encodedPath);
  if (!path) return;

  const matchingNavLink = navLinks.find(
    (link) => link.getAttribute("href") === path
  );
  const label = (matchingNavLink?.textContent || path).trim();

  await selectQuickLink(path, label);
});

reloadBtn.addEventListener("click", async () => {
  if (!state.selectedPath) return;
  await fetchEndpoint(state.selectedPath);
});

clearBtn.addEventListener("click", () => {
  clearSelection();
});

clearSelection();
