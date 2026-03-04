const endpointButtons = Array.from(document.querySelectorAll(".endpoint-btn"))
const treeRoot = document.getElementById("tree-root")
const selectedPathLabel = document.getElementById("selected-path")
const previewPath = document.getElementById("preview-path")
const previewContent = document.getElementById("preview-content")
const reloadBtn = document.getElementById("reload-btn")
const clearBtn = document.getElementById("clear-btn")
const statusBadge = document.getElementById("status-badge")
const responseTime = document.getElementById("response-time")
const cacheBadge = document.getElementById("cache-badge")
const cacheMeta = document.getElementById("cache-meta")
const healthBadge = document.getElementById("health-badge")
const healthMeta = document.getElementById("health-meta")

const state = {
  selectedEndpointPath: "",
  selectedEndpointLabel: "",
  rootNodeId: "",
  selectedNodeId: "",
  nodeMap: new Map(),
  collapsedNodeIds: new Set(),
  endpointCache: new Map(),
}

const HEALTH_REFRESH_INTERVAL_MS = 45_000

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

const isContainer = (value) => typeof value === "object" && value !== null

const getValueType = (value) => {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  if (typeof value === "object") return "object"
  return typeof value
}

const truncate = (value, maxLength = 72) => {
  const text = String(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

const setBadge = (element, text, tone) => {
  element.textContent = text
  element.className = `badge badge-${tone}`
}

const setActiveEndpoint = (path) => {
  endpointButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.path === path)
  })
}

const setRequestStatus = (text, tone, elapsedText = "--") => {
  setBadge(statusBadge, text, tone)
  responseTime.textContent = elapsedText
}

const setSourceStatus = (text, tone, meta = "") => {
  setBadge(cacheBadge, text, tone)
  cacheMeta.textContent = meta
}

const renderTreePlaceholder = () => {
  treeRoot.innerHTML = '<p class="placeholder">Choose an endpoint.</p>'
}

const renderLoadingState = (path) => {
  treeRoot.innerHTML = '<p class="placeholder">Loading endpoint data…</p>'
  previewPath.textContent = path
  previewContent.innerHTML = "<code>Fetching data from API…</code>"
}

const renderErrorState = (path, message) => {
  treeRoot.innerHTML = `<p class="placeholder">Failed to load endpoint.</p>`
  previewPath.textContent = path
  previewContent.innerHTML = `<code>${escapeHtml(
    `Request failed for ${path}\n\n${message}\n\nCheck browser console for details.`
  )}</code>`
}

const resetPreview = (message = "Click a node to preview.", label = "No file selected") => {
  previewPath.textContent = label
  previewContent.innerHTML = `<code>${escapeHtml(message)}</code>`
}

const getPointerPath = (node) => {
  if (!node) return state.selectedEndpointPath || "/"
  if (!node.pointer) return state.selectedEndpointPath || "/"
  return `${state.selectedEndpointPath}${node.pointer}`
}

const getSelectedEndpointPathname = () => {
  try {
    return new URL(state.selectedEndpointPath || "/", window.location.origin).pathname
  } catch {
    return state.selectedEndpointPath || "/"
  }
}

const shouldFlattenRootForEndpoint = () => {
  const pathname = getSelectedEndpointPathname()
  return pathname === "/repos" || pathname === "/files"
}

const shouldCollapseAllFoldersByDefault = () => {
  const pathname = getSelectedEndpointPathname()
  return pathname === "/repos" || pathname === "/files"
}

const sortObjectEntries = (entries) => {
  return entries.sort(([leftName, leftValue], [rightName, rightValue]) => {
    const leftIsContainer = isContainer(leftValue)
    const rightIsContainer = isContainer(rightValue)

    if (leftIsContainer !== rightIsContainer) {
      return leftIsContainer ? -1 : 1
    }

    return leftName.localeCompare(rightName)
  })
}

const isFileSystemItem = (value) => {
  if (!isContainer(value)) return false
  if (typeof value.name !== "string") return false
  if (value.type !== "file" && value.type !== "directory") return false
  if ("children" in value && value.children !== undefined && !Array.isArray(value.children)) {
    return false
  }
  return true
}

const fileSystemItemToValue = (item) => {
  if (!isFileSystemItem(item)) return item

  if (item.type === "file") {
    if (typeof item.content === "string") return item.content
    if (typeof item.url === "string") return item.url
    return ""
  }

  const directory = {}
  const children = Array.isArray(item.children) ? item.children : []

  children.forEach((child, index) => {
    const childName =
      isFileSystemItem(child) && child.name.trim() ? child.name.trim() : `item-${index + 1}`
    directory[childName] = fileSystemItemToValue(child)
  })

  return directory
}

const selectTerminalRepoRoot = (root) => {
  if (!isFileSystemItem(root) || root.type !== "directory") return root

  const children = Array.isArray(root.children) ? root.children : []
  const github = children.find(
    (item) => isFileSystemItem(item) && item.type === "directory" && item.name === "github"
  )
  const projects = children.find(
    (item) => isFileSystemItem(item) && item.type === "directory" && item.name === "projects"
  )

  return github ?? projects ?? root
}

const buildRepoMapFromArray = (reposArray) => {
  const result = {}
  const usedNames = new Map()

  reposArray.forEach((repo, index) => {
    const baseName =
      isContainer(repo) && typeof repo.name === "string" && repo.name.trim()
        ? repo.name.trim()
        : isContainer(repo) && typeof repo.full_name === "string" && repo.full_name.trim()
          ? repo.full_name.trim()
          : `repo-${index + 1}`

    const seenCount = usedNames.get(baseName) ?? 0
    usedNames.set(baseName, seenCount + 1)
    const key = seenCount === 0 ? baseName : `${baseName} (${seenCount + 1})`

    result[key] = repo
  })

  return result
}

const normalizeFilesPayload = (payload) => {
  if (isFileSystemItem(payload)) {
    const repoRoot = selectTerminalRepoRoot(payload)
    return fileSystemItemToValue(repoRoot)
  }

  if (isContainer(payload) && isContainer(payload.data) && isContainer(payload.data.files)) {
    return payload.data.files
  }

  return payload
}

const normalizeReposPayload = (payload) => {
  if (!isContainer(payload) || !Array.isArray(payload.data)) return payload
  return buildRepoMapFromArray(payload.data)
}

const normalizePayloadForEndpoint = (path, payload) => {
  const url = new URL(path, window.location.origin)

  if (url.pathname === "/files") {
    return normalizeFilesPayload(payload)
  }

  if (url.pathname === "/repos") {
    return normalizeReposPayload(payload)
  }

  return payload
}

const getArrayNodeBaseName = (value, index) => {
  if (isContainer(value)) {
    if (typeof value.name === "string" && value.name.trim().length > 0) {
      return value.name.trim()
    }

    if (typeof value.full_name === "string" && value.full_name.trim().length > 0) {
      return value.full_name.trim()
    }

    if (typeof value.path === "string" && value.path.trim().length > 0) {
      return value.path.trim()
    }
  }

  return `[${index}]`
}

const getUniqueArrayNodeName = (baseName, usedNames) => {
  const seenCount = usedNames.get(baseName) ?? 0
  usedNames.set(baseName, seenCount + 1)
  return seenCount === 0 ? baseName : `${baseName} (${seenCount + 1})`
}

const buildTreeFromPayload = (payload) => {
  const nodeMap = new Map()
  let nodeCounter = 0

  const createNode = (name, value, depth, parentId, pointer) => {
    const id = `node-${nodeCounter++}`
    const type = getValueType(value)
    const kind = type === "object" || type === "array" ? "folder" : "file"

    const node = {
      id,
      name,
      value,
      type,
      kind,
      depth,
      parentId,
      pointer,
      childIds: [],
    }

    nodeMap.set(id, node)

    if (type === "object") {
      const entries = sortObjectEntries(Object.entries(value))

      entries.forEach(([key, childValue]) => {
        const escapedKey = key.replace(/~/g, "~0").replace(/\//g, "~1")
        const childId = createNode(key, childValue, depth + 1, id, `${pointer}/${escapedKey}`)
        node.childIds.push(childId)
      })
    }

    if (type === "array") {
      const usedNames = new Map()

      value.forEach((childValue, index) => {
        const baseName = getArrayNodeBaseName(childValue, index)
        const nodeName = getUniqueArrayNodeName(baseName, usedNames)
        const childId = createNode(nodeName, childValue, depth + 1, id, `${pointer}/${index}`)
        node.childIds.push(childId)
      })
    }

    return id
  }

  const rootName = state.selectedEndpointLabel || "response"
  const rootNodeId = createNode(rootName, payload, 0, null, "")
  const collapseAllFolders = shouldCollapseAllFoldersByDefault()

  const collapsedNodeIds = new Set(
    Array.from(nodeMap.values())
      .filter(
        (node) =>
          node.kind === "folder" &&
          (collapseAllFolders ? node.depth >= 1 : node.depth > 1)
      )
      .map((node) => node.id)
  )

  const firstFile = Array.from(nodeMap.values()).find((node) => node.kind === "file")

  state.nodeMap = nodeMap
  state.rootNodeId = rootNodeId
  state.selectedNodeId = firstFile?.id || rootNodeId
  state.collapsedNodeIds = collapsedNodeIds
}

const getNodeMeta = (node) => {
  if (node.kind === "folder") {
    return `${node.childIds.length} item${node.childIds.length === 1 ? "" : "s"}`
  }

  if (node.type === "string") {
    return truncate(node.value)
  }

  if (node.type === "null") {
    return "null"
  }

  return String(node.value)
}

const getNodeIcon = (node) => {
  if (node.kind === "folder") {
    return "📁"
  }

  const lowerName = node.name.toLowerCase()

  if (/\.(js|jsx|mjs|cjs)$/.test(lowerName)) return "🟨"
  if (/\.(ts|tsx)$/.test(lowerName)) return "🟦"
  if (/\.json$/.test(lowerName)) return "{}"
  if (/\.(md|mdx)$/.test(lowerName)) return "📝"
  if (/\.(png|jpg|jpeg|gif|svg|webp|avif)$/.test(lowerName)) return "🖼️"
  if (/^https?:\/\//i.test(String(node.value))) return "🔗"
  return "📄"
}

const renderTree = () => {
  const rootNode = state.nodeMap.get(state.rootNodeId)
  if (!rootNode) {
    renderTreePlaceholder()
    return
  }

  const rows = []

  const renderNode = (nodeId) => {
    const node = state.nodeMap.get(nodeId)
    if (!node) return

    const hasChildren = node.childIds.length > 0
    const isCollapsed = state.collapsedNodeIds.has(node.id)
    const isSelected = node.id === state.selectedNodeId

    rows.push(`
      <div class="tree-row" style="--depth:${node.depth}">
        ${
          hasChildren
            ? `<button type="button" class="tree-toggle" data-action="toggle" data-node="${node.id}">${isCollapsed ? "+" : "-"}</button>`
            : '<span class="tree-toggle-spacer"></span>'
        }
        <button type="button" class="tree-node ${isSelected ? "active" : ""}" data-action="select" data-node="${node.id}">
          <span>${getNodeIcon(node)}</span>
          <span class="node-name">${escapeHtml(node.name)}</span>
          <span class="node-meta">${escapeHtml(getNodeMeta(node))}</span>
        </button>
      </div>
    `)

    if (hasChildren && !isCollapsed) {
      node.childIds.forEach(renderNode)
    }
  }

  const hideRoot = shouldFlattenRootForEndpoint()
  if (hideRoot && rootNode.childIds.length > 0) {
    rootNode.childIds.forEach(renderNode)
  } else {
    renderNode(rootNode.id)
  }
  treeRoot.innerHTML = `<div class="tree-list">${rows.join("")}</div>`
}

const renderPreview = () => {
  const selectedNode = state.nodeMap.get(state.selectedNodeId)
  if (!selectedNode) {
    resetPreview()
    return
  }

  previewPath.textContent = getPointerPath(selectedNode)

  if (selectedNode.kind === "folder") {
    const summary = {
      type: selectedNode.type,
      items: selectedNode.childIds.length,
      path: getPointerPath(selectedNode),
    }
    previewContent.innerHTML = `<code>${escapeHtml(JSON.stringify(summary, null, 2))}</code>`
    return
  }

  const displayValue =
    selectedNode.type === "string" ? selectedNode.value : JSON.stringify(selectedNode.value, null, 2)

  previewContent.innerHTML = `<code>${escapeHtml(displayValue)}</code>`
}

const hydrateExplorer = (payload) => {
  buildTreeFromPayload(payload)
  renderTree()
  renderPreview()
}

const fetchEndpoint = async (path) => {
  setRequestStatus("loading", "info", "...")
  setSourceStatus("checking", "info")
  renderLoadingState(path)

  const startTime = performance.now()
  const cachedEntry = state.endpointCache.get(path)
  const headers = {
    accept: "application/json, text/plain, */*",
  }

  if (cachedEntry?.etag) {
    headers["if-none-match"] = cachedEntry.etag
  }

  try {
    const response = await fetch(path, { headers })
    const elapsed = Math.round(performance.now() - startTime)

    let payload
    let sourceTone = "network"
    let sourceText = "network"
    let sourceMeta = ""

    if (response.status === 304 && cachedEntry) {
      payload = cachedEntry.payload
      sourceTone = "cache"
      sourceText = "cache hit"
      sourceMeta = `etag match • ${new Date(cachedEntry.fetchedAt).toLocaleTimeString()}`
      setRequestStatus("304", "success", `${elapsed} ms`)
    } else {
      const contentType = response.headers.get("content-type") || ""
      const parsedPayload = contentType.includes("application/json")
        ? await response.json()
        : await response.text()

      payload = normalizePayloadForEndpoint(path, parsedPayload)

      const statusText = `${response.status} ${response.statusText || ""}`.trim()
      setRequestStatus(statusText, response.ok ? "success" : "error", `${elapsed} ms`)

      if (response.ok) {
        const etag = response.headers.get("etag")
        if (etag) {
          state.endpointCache.set(path, {
            etag,
            payload,
            fetchedAt: Date.now(),
          })
          sourceMeta = `etag ${truncate(etag, 26)}`
        } else {
          sourceMeta = "no etag"
        }
      }
    }

    setSourceStatus(sourceText, sourceTone, sourceMeta)
    hydrateExplorer(payload)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("endpoint.fetch.failed", { path, error: errorMessage })
    setRequestStatus("failed", "error", "--")
    setSourceStatus("unknown", "idle", "")
    renderErrorState(path, errorMessage)
  }
}

const selectEndpoint = async (path, label) => {
  state.selectedEndpointPath = path
  state.selectedEndpointLabel = label
  selectedPathLabel.textContent = path

  setActiveEndpoint(path)
  reloadBtn.disabled = false

  await fetchEndpoint(path)
}

const clearSelection = () => {
  state.selectedEndpointPath = ""
  state.selectedEndpointLabel = ""
  state.rootNodeId = ""
  state.selectedNodeId = ""
  state.nodeMap = new Map()
  state.collapsedNodeIds = new Set()

  selectedPathLabel.textContent = "none"
  setActiveEndpoint("")

  reloadBtn.disabled = true
  setRequestStatus("idle", "idle", "--")
  setSourceStatus("none", "idle", "")

  renderTreePlaceholder()
  resetPreview()
}

const refreshHealth = async () => {
  const startTime = performance.now()

  try {
    const response = await fetch("/health", {
      headers: { accept: "text/plain" },
      cache: "no-store",
    })

    const elapsed = Math.round(performance.now() - startTime)
    const text = (await response.text()).trim()

    if (response.ok && text.toLowerCase() === "ok") {
      setBadge(healthBadge, "healthy", "success")
    } else {
      setBadge(healthBadge, `http ${response.status}`, "error")
    }

    healthMeta.textContent = `${text || "no body"} • ${elapsed} ms`
  } catch {
    setBadge(healthBadge, "offline", "error")
    healthMeta.textContent = "health fetch failed"
  }
}

endpointButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const path = button.dataset.path || ""
    const label = button.dataset.label || path
    if (!path) return

    await selectEndpoint(path, label)
  })
})

treeRoot.addEventListener("click", (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const actionElement = target.closest("[data-action]")
  if (!(actionElement instanceof HTMLElement)) return

  const action = actionElement.dataset.action
  const nodeId = actionElement.dataset.node
  if (!action || !nodeId || !state.nodeMap.has(nodeId)) return

  if (action === "toggle") {
    if (state.collapsedNodeIds.has(nodeId)) {
      state.collapsedNodeIds.delete(nodeId)
    } else {
      state.collapsedNodeIds.add(nodeId)
    }

    renderTree()
    return
  }

  if (action === "select") {
    const node = state.nodeMap.get(nodeId)
    if (!node) return

    state.selectedNodeId = nodeId

    if (node.kind === "folder" && node.childIds.length > 0 && state.collapsedNodeIds.has(nodeId)) {
      state.collapsedNodeIds.delete(nodeId)
    }

    renderTree()
    renderPreview()
  }
})

reloadBtn.addEventListener("click", async () => {
  if (!state.selectedEndpointPath) return
  await fetchEndpoint(state.selectedEndpointPath)
})

clearBtn.addEventListener("click", () => {
  clearSelection()
})

clearSelection()
void refreshHealth()
setInterval(() => {
  void refreshHealth()
}, HEALTH_REFRESH_INTERVAL_MS)
