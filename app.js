"use strict";

const READINESS = {
  "ready-to-test": { label: "Ready to test", className: "ready", order: 0 },
  "needs-token-configuration": { label: "Needs token configuration", className: "token-work", order: 1 },
  "needs-component-refactoring": { label: "Needs component refactoring", className: "component-work", order: 2 },
  "needs-provisional-composition": { label: "Needs provisional composition or pattern", className: "composition-work", order: 3 },
  "out-of-scope": { label: "Out of scope for this experiment", className: "out", order: 4 }
};

const MECHANISMS = {
  token: { label: "Token", icon: "T", className: "token" },
  component: { label: "Component", icon: "C", className: "component" },
  "component-variant": { label: "Component variant", icon: "V", className: "component-variant" },
  composition: { label: "Composition", icon: "◫", className: "composition" }
};

const THEME_LABELS = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  unknown: "Unknown",
  "not-applicable": "Not applicable"
};

const CYCLE_LABELS = {
  "plan-release": "Plan release",
  "parallel-test": "Parallel test",
  learn: "Learn",
  "fold-in": "Fold in"
};

const FILTER_DEFINITIONS = [
  { key: "readiness", label: "Readiness", get: (record) => [record.readiness], format: (value) => READINESS[value]?.label || value },
  { key: "mechanism", label: "Change mechanism", get: (record) => [record.changeMechanism], format: (value) => MECHANISMS[value]?.label || value },
  { key: "owner", label: "Owner", get: (record) => [record.owner.name] },
  { key: "milestone", label: "Target milestone", get: (record) => [record.targetMilestone] },
  { key: "theme", label: "Theme-ready", get: (record) => [record.themeReady], format: (value) => THEME_LABELS[value] || value },
  { key: "platform", label: "Surface / platform", get: (record) => record.surfacePlatformCoverage },
  { key: "vertical", label: "Vertical", get: (record) => [record.vertical || "Unspecified"] },
  { key: "lifecycle", label: "Operating cycle", get: (record) => [record.lifecycleStage || "plan-release"], format: (value) => CYCLE_LABELS[value] || value },
  { key: "blocker", label: "Blocker", get: (record) => [record.blockerCategory || "Uncategorised"] }
];

const FILTER_BY_KEY = Object.fromEntries(FILTER_DEFINITIONS.map((definition) => [definition.key, definition]));

const state = {
  dataset: null,
  records: [],
  search: "",
  group: "none",
  sort: "readiness",
  filters: Object.fromEntries(FILTER_DEFINITIONS.map(({ key }) => [key, new Set()])),
  validationWarnings: []
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  await loadConfiguredDataset();
});

function cacheElements() {
  const ids = [
    "source-button", "data-badge-text", "import-button", "data-strategy-button", "source-summary",
    "snapshot-meta", "mechanism-breakdown", "owner-breakdown", "milestone-breakdown", "blocker-breakdown",
    "matrix-search", "filter-button", "filter-count", "group-select", "sort-select", "active-filters",
    "results-count", "matrix-body", "mobile-card-list", "empty-state", "backlog-list", "backlog-count",
    "filter-dialog", "filter-groups", "detail-dialog", "detail-eyebrow", "detail-title", "detail-content",
    "import-dialog", "data-file", "import-status", "restore-sample-button", "source-dialog", "cycle-steps"
  ];
  ids.forEach((id) => { elements[toCamel(id)] = document.getElementById(id); });
}

function bindEvents() {
  elements.sourceButton.addEventListener("click", () => elements.sourceDialog.showModal());
  elements.dataStrategyButton.addEventListener("click", () => elements.sourceDialog.showModal());
  elements.importButton.addEventListener("click", () => elements.importDialog.showModal());
  elements.filterButton.addEventListener("click", () => elements.filterDialog.showModal());
  elements.restoreSampleButton.addEventListener("click", restoreConfiguredSample);
  elements.dataFile.addEventListener("change", handleFileImport);

  elements.matrixSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderAll();
  });
  elements.groupSelect.addEventListener("change", (event) => {
    state.group = event.target.value;
    renderMatrix();
  });
  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderMatrix();
    renderBacklog();
  });

  document.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) {
      closeButton.closest("dialog")?.close();
      return;
    }

    const clearButton = event.target.closest("[data-clear-all]");
    if (clearButton) {
      clearAllFilters();
      return;
    }

    const summaryButton = event.target.closest("[data-readiness]");
    if (summaryButton) {
      setSingleFilter("readiness", summaryButton.dataset.readiness);
      scrollToMatrix();
      return;
    }

    const breakdownButton = event.target.closest("[data-breakdown-key]");
    if (breakdownButton) {
      setSingleFilter(breakdownButton.dataset.breakdownKey, breakdownButton.dataset.breakdownValue);
      scrollToMatrix();
      return;
    }

    const savedViewButton = event.target.closest("[data-view]");
    if (savedViewButton) {
      applySavedView(savedViewButton.dataset.view);
      return;
    }

    const removeFilterButton = event.target.closest("[data-remove-filter]");
    if (removeFilterButton) {
      state.filters[removeFilterButton.dataset.filterKey].delete(removeFilterButton.dataset.filterValue);
      renderAll();
      return;
    }

    const recordButton = event.target.closest("[data-record-id]");
    if (recordButton) {
      openRecordDetail(recordButton.dataset.recordId);
      return;
    }

    const cycleButton = event.target.closest("[data-cycle]");
    if (cycleButton) {
      setSingleFilter("lifecycle", cycleButton.dataset.cycle);
      scrollToMatrix();
    }
  });

  [elements.filterDialog, elements.detailDialog, elements.importDialog, elements.sourceDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function loadConfiguredDataset() {
  setLoadingState();
  try {
    const configResponse = await fetch("./data/source-config.json", { cache: "no-store" });
    if (!configResponse.ok) throw new Error(`Source configuration returned ${configResponse.status}.`);
    const config = await configResponse.json();
    if (config.adapter !== "bundled-json") throw new Error(`Unsupported configured adapter: ${config.adapter}.`);

    const datasetResponse = await fetch(config.url, { cache: "no-store" });
    if (!datasetResponse.ok) throw new Error(`Dataset returned ${datasetResponse.status}.`);
    const rawDataset = await datasetResponse.json();
    const validated = validateDataset(rawDataset, { strict: config.strict !== false });
    useDataset(validated.dataset, validated.warnings);
  } catch (error) {
    displayFatalLoadError(error);
  }
}

async function restoreConfiguredSample() {
  elements.importStatus.innerHTML = "<span class=\"loading-line\">Restoring the configured starter dataset…</span>";
  await loadConfiguredDataset();
  if (state.dataset) {
    elements.importStatus.innerHTML = "<div class=\"success-message\"><strong>Starter sample restored.</strong><span>The dashboard is back in clearly labelled sample mode.</span></div>";
  }
}

function useDataset(dataset, warnings = []) {
  state.dataset = dataset;
  state.records = dataset.records;
  state.validationWarnings = [...(dataset.warnings || []), ...warnings];
  state.search = "";
  elements.matrixSearch.value = "";
  resetFilterSets();
  updateSourceUI();
  buildFilterDialog();
  renderAll();
}

function validateDataset(rawDataset, options = {}) {
  const sourceRecords = Array.isArray(rawDataset) ? rawDataset : (rawDataset.records || rawDataset.items || []);
  const errors = [];
  const warnings = [];
  const seenIds = new Set();

  if (!Array.isArray(sourceRecords)) throw new Error("The dataset must contain a records array.");

  const records = sourceRecords.map((rawRecord, index) => {
    const location = `Row ${index + 1}`;
    const record = normaliseRecord(rawRecord);
    if (!record.id) errors.push(`${location}: missing id.`);
    if (record.id && seenIds.has(record.id)) errors.push(`${location}: duplicate id “${record.id}”.`);
    if (record.id) seenIds.add(record.id);
    if (!record.vdlChange) errors.push(`${location}: missing VDL change.`);
    if (!MECHANISMS[record.changeMechanism]) errors.push(`${location}: invalid change mechanism “${record.changeMechanism || "blank"}”.`);
    if (!READINESS[record.readiness]) errors.push(`${location}: invalid readiness “${record.readiness || "blank"}”.`);
    if (!record.owner.name) errors.push(`${location}: missing owner.`);
    if (!record.nextAction.label) errors.push(`${location}: missing next action.`);
    if (record.owner.name.toLowerCase() === "unassigned") warnings.push(`${record.id || location}: owner is unassigned.`);
    if (!record.targetMilestone) warnings.push(`${record.id || location}: target milestone is missing.`);
    return record;
  });

  if (errors.length && options.strict !== false) {
    const error = new Error(`Validation failed: ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ""}`);
    error.validationErrors = errors;
    throw error;
  }

  const dataset = {
    schemaVersion: Number(rawDataset.schemaVersion || 1),
    source: rawDataset.source || { kind: "json", label: "Imported JSON", retrievedAt: new Date().toISOString(), isSample: false },
    strategySource: rawDataset.strategySource || null,
    warnings: rawDataset.warnings || [],
    records
  };
  return { dataset, warnings };
}

function normaliseRecord(rawRecord) {
  const owner = typeof rawRecord.owner === "string" ? { name: rawRecord.owner } : (rawRecord.owner || {});
  const nextAction = typeof rawRecord.nextAction === "string" ? { label: rawRecord.nextAction } : (rawRecord.nextAction || {});
  return {
    id: stringOrEmpty(rawRecord.id),
    vdlChange: stringOrEmpty(rawRecord.vdlChange),
    changeSummary: stringOrEmpty(rawRecord.changeSummary),
    changeMechanism: stringOrEmpty(rawRecord.changeMechanism).toLowerCase(),
    existingDesignToken: nullableString(rawRecord.existingDesignToken),
    existingCodeToken: nullableString(rawRecord.existingCodeToken),
    connectedComponents: toStringArray(rawRecord.connectedComponents),
    themeReady: stringOrEmpty(rawRecord.themeReady || "unknown").toLowerCase().replaceAll("_", "-"),
    surfacePlatformCoverage: toStringArray(rawRecord.surfacePlatformCoverage),
    requiredWork: stringOrEmpty(rawRecord.requiredWork),
    readiness: stringOrEmpty(rawRecord.readiness).toLowerCase().replaceAll("_", "-"),
    owner: { name: stringOrEmpty(owner.name), contactUrl: safeUrl(owner.contactUrl) },
    dependencies: toStringArray(rawRecord.dependencies),
    targetMilestone: stringOrEmpty(rawRecord.targetMilestone),
    nextAction: { label: stringOrEmpty(nextAction.label), url: safeUrl(nextAction.url) },
    vertical: stringOrEmpty(rawRecord.vertical || "Unspecified"),
    lifecycleStage: stringOrEmpty(rawRecord.lifecycleStage || "plan-release").toLowerCase().replaceAll("_", "-"),
    priority: stringOrEmpty(rawRecord.priority || "P2").toUpperCase(),
    blockerCategory: stringOrEmpty(rawRecord.blockerCategory || "Uncategorised"),
    provenance: rawRecord.provenance || {}
  };
}

function setLoadingState() {
  elements.resultsCount.textContent = "Loading matrix…";
  elements.matrixBody.innerHTML = "<tr><td colspan=\"4\" class=\"loading-cell\">Loading the configured data source…</td></tr>";
}

function displayFatalLoadError(error) {
  state.dataset = null;
  state.records = [];
  elements.dataBadgeText.textContent = "Source error";
  elements.sourceSummary.textContent = "The configured source could not be loaded. No sample data was silently substituted.";
  elements.resultsCount.textContent = "Data source unavailable";
  elements.matrixBody.innerHTML = `<tr><td colspan="4"><div class="load-error"><strong>We couldn’t load the configured dataset.</strong><span>${escapeHtml(error.message)}</span><button class="action-link" type="button" id="retry-load">Try again →</button></div></td></tr>`;
  document.getElementById("retry-load")?.addEventListener("click", loadConfiguredDataset);
  renderBacklog();
}

function updateSourceUI() {
  const source = state.dataset.source || {};
  const isSample = source.isSample === true || source.kind === "sample";
  elements.dataBadgeText.textContent = isSample ? "Sample data" : source.kind === "csv" || source.kind === "json" ? "Local import" : "Live data";
  elements.sourceButton.classList.toggle("is-live", !isSample);
  elements.sourceSummary.textContent = isSample
    ? "Matrix rows are illustrative, explicitly labelled, and replaceable."
    : `${source.label || "Imported data"} · loaded locally for this browser session.`;
}

function renderAll() {
  if (!state.dataset) return;
  renderSummary();
  renderCycle();
  renderBreakdowns();
  renderActiveFilters();
  renderMatrix();
  renderBacklog();
  updateFilterButton();
}

function renderSummary() {
  const counts = countBy(state.records, (record) => record.readiness);
  document.querySelectorAll("[data-readiness]").forEach((button) => {
    const readiness = button.dataset.readiness;
    button.querySelector("strong").textContent = counts[readiness] || 0;
    button.setAttribute("aria-pressed", String(state.filters.readiness.has(readiness)));
  });
  const readyCount = counts["ready-to-test"] || 0;
  const qualifier = state.dataset.source.isSample ? "illustrative changes" : "changes";
  elements.snapshotMeta.textContent = `${state.records.length} ${qualifier} · ${readyCount} ready now`;
}

function renderCycle() {
  const counts = countBy(state.records, (record) => record.lifecycleStage || "plan-release");
  Object.keys(CYCLE_LABELS).forEach((cycle) => {
    const countElement = document.getElementById(`cycle-${cycle}`);
    if (countElement) countElement.textContent = counts[cycle] || 0;
  });
  elements.cycleSteps.querySelectorAll("[data-cycle]").forEach((button) => {
    button.closest("li").classList.toggle("current", state.filters.lifecycle.has(button.dataset.cycle));
    button.setAttribute("aria-pressed", String(state.filters.lifecycle.has(button.dataset.cycle)));
  });
}

function renderBreakdowns() {
  renderBreakdown(elements.mechanismBreakdown, state.records, "mechanism", (record) => record.changeMechanism, 4);
  renderBreakdown(elements.ownerBreakdown, state.records, "owner", (record) => record.owner.name, 5);
  renderBreakdown(elements.milestoneBreakdown, state.records, "milestone", (record) => record.targetMilestone, 5);
  const blockedRecords = state.records.filter((record) => record.readiness !== "ready-to-test");
  renderBreakdown(elements.blockerBreakdown, blockedRecords, "blocker", (record) => record.blockerCategory, 5);
}

function renderBreakdown(container, records, key, getter, limit) {
  const counts = countBy(records, getter);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const formatter = FILTER_BY_KEY[key]?.format || ((value) => value);
  container.innerHTML = entries.length ? entries.map(([value, count]) => `
    <button class="breakdown-row" type="button" data-breakdown-key="${escapeHtml(key)}" data-breakdown-value="${escapeHtml(value)}" aria-pressed="${state.filters[key].has(value)}">
      <span class="breakdown-copy"><b>${escapeHtml(formatter(value))}</b><strong>${count}</strong></span>
      <span class="breakdown-track"><i style="--bar:${Math.max(8, Math.round((count / max) * 100))}%"></i></span>
    </button>`).join("") : "<p class=\"quiet\">No blockers in this dataset.</p>";
}

function renderActiveFilters() {
  const chips = [];
  FILTER_DEFINITIONS.forEach((definition) => {
    state.filters[definition.key].forEach((value) => {
      const formatted = definition.format ? definition.format(value) : value;
      chips.push(`<span>${escapeHtml(definition.label)}: ${escapeHtml(formatted)} <button type="button" data-remove-filter data-filter-key="${escapeHtml(definition.key)}" data-filter-value="${escapeHtml(value)}" aria-label="Remove ${escapeHtml(definition.label)} ${escapeHtml(formatted)} filter">×</button></span>`);
    });
  });
  if (state.search) chips.push(`<span>Search: “${escapeHtml(state.search)}” <button type="button" id="clear-search" aria-label="Clear search">×</button></span>`);
  elements.activeFilters.hidden = chips.length === 0;
  elements.activeFilters.innerHTML = chips.length ? `${chips.join("")}<button class="clear-filters" type="button" data-clear-all>Clear all</button>` : "";
  document.getElementById("clear-search")?.addEventListener("click", () => {
    state.search = "";
    elements.matrixSearch.value = "";
    renderAll();
  });
}

function renderMatrix() {
  const filtered = getFilteredRecords();
  const sorted = sortRecords(filtered);
  const grouped = groupRecords(sorted);
  elements.resultsCount.textContent = `${filtered.length} of ${state.records.length} ${filtered.length === 1 ? "change" : "changes"}`;
  elements.emptyState.hidden = filtered.length !== 0;
  document.querySelector(".table-wrap").hidden = filtered.length === 0;
  elements.mobileCardList.hidden = filtered.length === 0;

  elements.matrixBody.innerHTML = Array.from(grouped.entries()).map(([groupName, records]) => {
    const groupHeader = state.group === "none" ? "" : `<tr class="group-row"><th colspan="4" scope="rowgroup">${escapeHtml(groupLabel(state.group, groupName))}<span>${records.length}</span></th></tr>`;
    return groupHeader + records.map(renderTableRow).join("");
  }).join("");

  elements.mobileCardList.innerHTML = Array.from(grouped.entries()).map(([groupName, records]) => {
    const groupHeader = state.group === "none" ? "" : `<h3 class="mobile-group-title">${escapeHtml(groupLabel(state.group, groupName))}<span>${records.length}</span></h3>`;
    return groupHeader + records.map(renderMobileCard).join("");
  }).join("");
}

function renderTableRow(record) {
  const mechanism = MECHANISMS[record.changeMechanism];
  const readiness = READINESS[record.readiness];
  const owner = renderOwner(record.owner);
  const action = renderAction(record);
  return `<tr class="mechanism-${escapeHtml(record.changeMechanism)}">
    <th scope="row"><button class="row-title" type="button" data-record-id="${escapeHtml(record.id)}"><strong>${escapeHtml(record.vdlChange)}</strong><small>${escapeHtml(record.changeSummary || record.id)}</small></button><div class="row-mechanism">${renderMechanismPill(mechanism)}</div></th>
    <td>${renderReadinessPill(record.readiness, readiness)}</td>
    <td><div class="plan-cell">${owner}<small>${escapeHtml(record.targetMilestone || "No milestone")}</small></div></td>
    <td>${action}</td>
  </tr>`;
}

function renderMobileCard(record) {
  const mechanism = MECHANISMS[record.changeMechanism];
  const readiness = READINESS[record.readiness];
  return `<article class="mobile-matrix-card mechanism-${escapeHtml(record.changeMechanism)}">
    <button class="mobile-card-main" type="button" data-record-id="${escapeHtml(record.id)}">
      <span class="mobile-card-kicker">${renderMechanismPill(mechanism)}</span>
      <strong>${escapeHtml(record.vdlChange)}</strong><small>${escapeHtml(record.changeSummary || "")}</small>
      ${renderReadinessPill(record.readiness, readiness)}
    </button>
    <dl><div><dt>Owner</dt><dd>${escapeHtml(record.owner.name)}</dd></div><div><dt>Milestone</dt><dd>${escapeHtml(record.targetMilestone || "—")}</dd></div></dl>
    ${renderAction(record)}
  </article>`;
}

function renderMechanismPill(mechanism) {
  return `<span class="mechanism-pill ${escapeHtml(mechanism.className)}"><b>${escapeHtml(mechanism.icon)}</b>${escapeHtml(mechanism.label)}</span>`;
}

function renderReadinessPill(value, readiness) {
  return `<span class="readiness-pill ${escapeHtml(readiness.className)}"><i aria-hidden="true"></i>${escapeHtml(readiness.label)}</span>`;
}

function renderCoverage(values) {
  if (!values.length) return "—";
  const visible = values.slice(0, 2).map((value) => `<span class="coverage-pill">${escapeHtml(value)}</span>`).join(" ");
  const overflow = values.length > 2 ? ` <span class="coverage-pill coverage-more">+${values.length - 2}</span>` : "";
  return visible + overflow;
}

function renderOwner(owner) {
  const initials = initialsFor(owner.name);
  const copy = `<span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>${escapeHtml(owner.name)}`;
  return owner.contactUrl ? `<a class="owner-link" href="${escapeHtml(owner.contactUrl)}" target="_blank" rel="noreferrer">${copy}</a>` : `<span class="owner-copy">${copy}</span>`;
}

function renderAction(record) {
  const label = escapeHtml(record.nextAction.label);
  return record.nextAction.url
    ? `<a class="action-link" href="${escapeHtml(record.nextAction.url)}" target="_blank" rel="noreferrer">${label}<span aria-hidden="true">↗</span></a>`
    : `<button class="action-link" type="button" data-record-id="${escapeHtml(record.id)}">${label}<span aria-hidden="true">→</span></button>`;
}

function renderBacklog() {
  if (!state.dataset) {
    elements.backlogCount.textContent = "0 capabilities";
    elements.backlogList.innerHTML = "<div class=\"empty-backlog\">Load a valid source to build the backlog.</div>";
    return;
  }
  const backlogRecords = sortRecords(getFilteredRecords().filter((record) => !["ready-to-test", "out-of-scope"].includes(record.readiness)));
  elements.backlogCount.textContent = `${backlogRecords.length} ${backlogRecords.length === 1 ? "capability" : "capabilities"}`;
  elements.backlogList.innerHTML = backlogRecords.length ? backlogRecords.map((record) => `
    <article class="backlog-item">
      <span class="priority ${escapeHtml(record.priority.toLowerCase())}">${escapeHtml(record.priority)}</span>
      <div class="backlog-copy"><span class="backlog-kicker">${escapeHtml(record.blockerCategory)} · unblocks ${escapeHtml(record.vdlChange)}</span><h3>${escapeHtml(record.requiredWork || "Required work not yet described")}</h3><div>${renderMechanismPill(MECHANISMS[record.changeMechanism])}<span class="backlog-meta">${escapeHtml(record.owner.name)} · ${escapeHtml(record.targetMilestone || "No milestone")}</span></div></div>
      ${renderAction(record)}
    </article>`).join("") : "<div class=\"empty-backlog\"><strong>No enabling work in this view.</strong><span>Either these changes are ready to test, out of scope, or filtered out.</span></div>";
}

function buildFilterDialog() {
  elements.filterGroups.innerHTML = FILTER_DEFINITIONS.map((definition) => {
    const values = uniqueValues(state.records.flatMap(definition.get));
    if (!values.length) return "";
    return `<fieldset><legend>${escapeHtml(definition.label)}</legend><div class="checkbox-list">${values.map((value) => {
      const formatted = definition.format ? definition.format(value) : value;
      const count = state.records.filter((record) => definition.get(record).includes(value)).length;
      return `<label><input type="checkbox" data-filter-input="${escapeHtml(definition.key)}" value="${escapeHtml(value)}" ${state.filters[definition.key].has(value) ? "checked" : ""}/><span>${escapeHtml(formatted)}</span><small>${count}</small></label>`;
    }).join("")}</div></fieldset>`;
  }).join("");

  elements.filterGroups.querySelectorAll("[data-filter-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const filterSet = state.filters[input.dataset.filterInput];
      if (input.checked) filterSet.add(input.value); else filterSet.delete(input.value);
      renderAll();
    });
  });
}

function openRecordDetail(recordId) {
  const record = state.records.find((candidate) => candidate.id === recordId);
  if (!record) return;
  const mechanism = MECHANISMS[record.changeMechanism];
  const readiness = READINESS[record.readiness];
  elements.detailEyebrow.textContent = `${record.id} · ${mechanism.label}`;
  elements.detailTitle.textContent = record.vdlChange;
  elements.detailContent.innerHTML = `
    <div class="detail-status-row">${renderMechanismPill(mechanism)}${renderReadinessPill(record.readiness, readiness)}<span class="theme-status">Theme-ready: <b>${escapeHtml(THEME_LABELS[record.themeReady] || record.themeReady)}</b></span></div>
    <p class="detail-summary">${escapeHtml(record.changeSummary || "No summary provided.")}</p>
    <dl class="detail-grid">
      ${detailField("Existing design token", record.existingDesignToken || "Not recorded")}
      ${detailField("Existing code token", record.existingCodeToken || "Not recorded")}
      ${detailField("Connected components", listText(record.connectedComponents))}
      ${detailField("Surface / platform coverage", listText(record.surfacePlatformCoverage))}
      ${detailField("Owner", record.owner.name)}
      ${detailField("Target milestone", record.targetMilestone || "Not recorded")}
    </dl>
    <section class="detail-section"><h3>Required work</h3><p>${escapeHtml(record.requiredWork || "Not yet described.")}</p></section>
    <section class="detail-section"><h3>Dependencies</h3>${record.dependencies.length ? `<ul>${record.dependencies.map((dependency) => `<li>${escapeHtml(dependency)}</li>`).join("")}</ul>` : "<p>None recorded.</p>"}</section>
    <section class="next-action-card"><div><span>Next action</span><strong>${escapeHtml(record.nextAction.label)}</strong><small>Owner: ${escapeHtml(record.owner.name)}</small></div>${record.nextAction.url ? `<a class="button button-primary" href="${escapeHtml(record.nextAction.url)}" target="_blank" rel="noreferrer">Open action ↗</a>` : "<span class=\"action-route-note\">Add a URL in the source data to make this action directly navigable.</span>"}</section>
    <div class="provenance-note"><strong>Record provenance</strong><span>${record.provenance?.isSample ? "Illustrative starter record — not a verified readiness fact." : escapeHtml(record.provenance?.sourceUrl || state.dataset.source.label || "Imported source")}</span><small>${escapeHtml(record.provenance?.updatedAt || state.dataset.source.retrievedAt || "No update date")}</small></div>`;
  elements.detailDialog.showModal();
}

function detailField(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

async function handleFileImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  elements.importStatus.innerHTML = `<span class="loading-line">Validating ${escapeHtml(file.name)}…</span>`;
  try {
    const text = await file.text();
    let rawDataset;
    if (file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv")) {
      const records = recordsFromCsv(text);
      rawDataset = { schemaVersion: 1, source: importSource("csv", file.name), records };
    } else {
      rawDataset = JSON.parse(text);
      if (Array.isArray(rawDataset)) rawDataset = { schemaVersion: 1, source: importSource("json", file.name), records: rawDataset };
      else rawDataset.source = { ...(rawDataset.source || {}), ...importSource("json", file.name), isSample: false };
    }
    const validated = validateDataset(rawDataset, { strict: true });
    useDataset(validated.dataset, validated.warnings);
    elements.importStatus.innerHTML = `<div class="success-message"><strong>${validated.dataset.records.length} records loaded.</strong><span>${validated.warnings.length ? `${validated.warnings.length} warning(s) remain.` : "All required fields passed validation."}</span></div>`;
  } catch (error) {
    elements.importStatus.innerHTML = `<div class="load-error"><strong>Import rejected.</strong><span>${escapeHtml(error.message)}</span></div>`;
  } finally {
    event.target.value = "";
  }
}

function importSource(kind, label) {
  return { kind, label, retrievedAt: new Date().toISOString(), version: "local-session", isSample: false };
}

function recordsFromCsv(text) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) throw new Error("The CSV must include a header row and at least one data row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const requiredHeaders = ["id", "vdl_change", "change_mechanism", "readiness", "owner_name", "next_action"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Missing required CSV columns: ${missingHeaders.join(", ")}.`);

  return rows.slice(1).map((cells) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, (cells[index] || "").trim()]));
    return {
      id: row.id,
      vdlChange: row.vdl_change,
      changeSummary: row.change_summary,
      changeMechanism: row.change_mechanism,
      existingDesignToken: row.existing_design_token || null,
      existingCodeToken: row.existing_code_token || null,
      connectedComponents: splitMultiValue(row.connected_components),
      themeReady: row.theme_ready || "unknown",
      surfacePlatformCoverage: splitMultiValue(row.surface_platform_coverage),
      requiredWork: row.required_work,
      readiness: row.readiness,
      owner: { name: row.owner_name, contactUrl: row.owner_contact_url },
      dependencies: splitMultiValue(row.dependencies),
      targetMilestone: row.target_milestone,
      nextAction: { label: row.next_action, url: row.next_action_url },
      vertical: row.vertical || "Unspecified",
      lifecycleStage: row.lifecycle_stage || "plan-release",
      priority: row.priority || "P2",
      blockerCategory: row.blocker_category || "Uncategorised",
      provenance: { sourceUrl: safeUrl(row.source_url), sourceRecordId: row.source_record_id || row.id, updatedAt: row.updated_at }
    };
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  return rows;
}

function getFilteredRecords() {
  return state.records.filter((record) => {
    const searchable = [
      record.id, record.vdlChange, record.changeSummary, record.changeMechanism, record.existingDesignToken,
      record.existingCodeToken, record.requiredWork, record.owner.name, record.targetMilestone, record.nextAction.label,
      record.blockerCategory, ...record.connectedComponents, ...record.surfacePlatformCoverage, ...record.dependencies
    ].filter(Boolean).join(" ").toLowerCase();
    if (state.search && !searchable.includes(state.search)) return false;
    return FILTER_DEFINITIONS.every((definition) => {
      const selected = state.filters[definition.key];
      if (!selected.size) return true;
      return definition.get(record).some((value) => selected.has(value));
    });
  });
}

function sortRecords(records) {
  const readinessOrder = (record) => READINESS[record.readiness]?.order ?? 99;
  const milestoneOrder = (record) => {
    const match = record.targetMilestone.match(/Milestone\s+(\d+)/i);
    return match ? Number(match[1]) : 99;
  };
  const priorityOrder = (record) => {
    const parsed = Number(record.priority.replace(/\D/g, ""));
    return Number.isFinite(parsed) ? parsed : 9;
  };
  const comparators = {
    priority: (a, b) => priorityOrder(a) - priorityOrder(b) || milestoneOrder(a) - milestoneOrder(b),
    milestone: (a, b) => milestoneOrder(a) - milestoneOrder(b),
    readiness: (a, b) => readinessOrder(a) - readinessOrder(b),
    owner: (a, b) => a.owner.name.localeCompare(b.owner.name),
    change: (a, b) => a.vdlChange.localeCompare(b.vdlChange)
  };
  return [...records].sort((a, b) => comparators[state.sort](a, b) || a.vdlChange.localeCompare(b.vdlChange));
}

function groupRecords(records) {
  const grouped = new Map();
  records.forEach((record) => {
    let key = "All changes";
    if (state.group === "readiness") key = record.readiness;
    if (state.group === "changeMechanism") key = record.changeMechanism;
    if (state.group === "owner") key = record.owner.name;
    if (state.group === "targetMilestone") key = record.targetMilestone || "No milestone";
    if (state.group === "blockerCategory") key = record.blockerCategory || "Uncategorised";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  });
  if (state.group === "readiness") return orderedMap(grouped, Object.keys(READINESS));
  if (state.group === "changeMechanism") return orderedMap(grouped, Object.keys(MECHANISMS));
  if (["owner", "targetMilestone", "blockerCategory"].includes(state.group)) {
    return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
  }
  return grouped;
}

function orderedMap(map, preferredOrder) {
  const entries = [];
  preferredOrder.forEach((key) => { if (map.has(key)) entries.push([key, map.get(key)]); });
  map.forEach((value, key) => { if (!preferredOrder.includes(key)) entries.push([key, value]); });
  return new Map(entries);
}

function groupLabel(group, value) {
  if (group === "readiness") return READINESS[value]?.label || value;
  if (group === "changeMechanism") return MECHANISMS[value]?.label || value;
  return value;
}

function setSingleFilter(key, value) {
  const alreadyOnlyValue = state.filters[key].size === 1 && state.filters[key].has(value);
  state.filters[key].clear();
  if (!alreadyOnlyValue) state.filters[key].add(value);
  syncFilterInputs();
  renderAll();
}

function applySavedView(view) {
  resetFilterSets();
  state.search = "";
  elements.matrixSearch.value = "";
  if (view === "ready") state.filters.readiness.add("ready-to-test");
  if (view === "token") state.filters.readiness.add("needs-token-configuration");
  if (view === "component") state.filters.readiness.add("needs-component-refactoring");
  if (view === "composition") {
    state.filters.mechanism.add("composition");
    state.filters.readiness.add("needs-provisional-composition");
  }
  if (view === "unowned") state.filters.owner.add("Unassigned");
  syncFilterInputs();
  renderAll();
  scrollToMatrix();
}

function clearAllFilters() {
  resetFilterSets();
  state.search = "";
  elements.matrixSearch.value = "";
  syncFilterInputs();
  renderAll();
}

function resetFilterSets() {
  Object.values(state.filters).forEach((set) => set.clear());
}

function syncFilterInputs() {
  elements.filterGroups.querySelectorAll("[data-filter-input]").forEach((input) => {
    input.checked = state.filters[input.dataset.filterInput].has(input.value);
  });
}

function updateFilterButton() {
  const count = Object.values(state.filters).reduce((total, set) => total + set.size, 0) + (state.search ? 1 : 0);
  elements.filterCount.textContent = count;
  elements.filterButton.setAttribute("aria-label", `Filters, ${count} active`);
}

function scrollToMatrix() {
  document.getElementById("matrix").scrollIntoView({ behavior: "smooth", block: "start" });
}

function countBy(records, getter) {
  return records.reduce((counts, record) => {
    const value = getter(record);
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map(stringOrEmpty).filter(Boolean);
  if (typeof value === "string") return splitMultiValue(value);
  return [];
}

function splitMultiValue(value) {
  return String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
}

function stringOrEmpty(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableString(value) {
  const normalised = stringOrEmpty(value);
  return normalised || null;
}

function safeUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(String(value), window.location.href);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function initialsFor(name) {
  return String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function listText(values) {
  return values.length ? values.join(" · ") : "None recorded";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
