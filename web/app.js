const svg = document.querySelector("#graph");
const detailPanel = document.querySelector("#detail-panel");
const emptyState = document.querySelector("#empty-state");
const statusBar = document.querySelector("#status-bar");
const findingsSection = document.querySelector("#findings-section");
const findingsBadge = document.querySelector("#findings-badge");
const findingsList = document.querySelector("#findings-list");

const NS = "http://www.w3.org/2000/svg";
let currentReport = null;

const reports = new Map();
const colors = {role: "#5683ed", permission: "#a18ad5", endpoint: "#299e90", object: "#8094b2"};

function validateReport(report) {
  if (!report || !report.summary || !Array.isArray(report.endpoints) || !Array.isArray(report.findings) ||
      !Array.isArray(report.graph?.nodes) || !Array.isArray(report.graph?.edges) ||
      report.endpoints.some(e => typeof e.key !== "string") ||
      report.graph.nodes.some(n => typeof n.id !== "string" || typeof n.label !== "string")) {
    throw new Error("Choose an explorer report with summary, endpoints, findings and graph data.");
  }
  return report;
}
function registerReport(report, label, activate = true) {
  validateReport(report);
  const id = `report-${reports.size}`;
  reports.set(id, report);
  const option = document.createElement("option");
  option.value = id;
  option.textContent = `${report.metadata?.target || "Imported target"} · ${label}`;
  const select = document.querySelector("#target-select");
  select.querySelector('option[value=""]')?.remove();
  if (report.metadata?.sample) {
    let group = select.querySelector('optgroup');
    if (!group) { group = document.createElement("optgroup"); group.label = "Sample websites · simulated assessments"; select.append(group); }
    group.append(option);
  } else {
    select.insertBefore(option, select.querySelector('optgroup'));
  }
  if (activate) { select.value = id; loadReport(report); }
}

function element(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = String(value);
}

function loadReport(report) {
  currentReport = report;
  for (const [id, key] of [["endpoint-count", "endpoint_count"], ["hidden-count", "undocumented_count"], ["tested-count", "tested_count"], ["finding-count", "finding_count"]]) setText(`#${id}`, report.summary[key] ?? "—");
  const date = new Date(report.metadata?.generated_at);
  setText("#generated-at", Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString(undefined, {dateStyle:"medium", timeStyle:"short"}));
  setText("#nav-count", report.findings.length);
  setText("#scan-state", report.metadata?.sample ? "Simulated assessment" : "Saved assessment");
  statusBar.textContent = report.metadata?.sample
    ? `Sample website · ${report.metadata.name} · Illustrative data only; no requests were sent to this website`
    : "Viewing saved report · " + (report.metadata?.target || "Imported target") + " · No live scan in progress";
  emptyState.style.display = "none";
  svg.style.display = "block";
  document.querySelector("#graph-filter").value = "all";
  drawGraph(report.graph);
  renderFindings(report.findings);
  renderReport();
  const first = report.endpoints.find(e => report.findings.some(f => f.endpoint === e.key)) || report.endpoints[0];
  detailPanel.querySelector(".detail-body").replaceChildren();
  if (first) showEndpoint(first.key);
  else detailPanel.querySelector(".detail-body").append(htmlNode("p", "This report contains no endpoints.", "detail-placeholder"));
}

function drawGraph(graph) {
  svg.replaceChildren();
  const filter = document.querySelector("#graph-filter").value;
  const endpointNodes = graph.nodes.filter(n => n.kind === "endpoint" && (filter === "all" || (filter === "hidden" ? n.undocumented : n.has_finding)));
  const ids = new Set(endpointNodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) || ids.has(e.target));
  const connected = new Set(edges.flatMap(e => [e.source, e.target]));
  const nodes = graph.nodes.filter(n => ids.has(n.id) || (n.kind !== "endpoint" && connected.has(n.id)));
  if (!endpointNodes.length) {
    const label = element("text", {x:575, y:150, "text-anchor":"middle", fill:"#8b9bb1", "font-size":16});
    label.textContent = "No endpoints match this filter.";
    svg.setAttribute("viewBox", "0 0 1150 340"); svg.append(label); return;
  }
  const order = ["role", "permission", "endpoint", "object"];
  const xByKind = {role:110, permission:370, endpoint:720, object:1030};
  const groups = Object.fromEntries(order.map(k => [k, nodes.filter(n => n.kind === k)]));
  const height = Math.max(500, Math.max(...order.map(k => groups[k].length)) * 88 + 60);
  svg.setAttribute("viewBox", `0 0 1150 ${height}`);
  const positions = new Map();
  for (const kind of order) groups[kind].forEach((n,i) => positions.set(n.id, {x:xByKind[kind], y:height/(groups[kind].length+1)*(i+1)}));
  for (const edge of edges) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    if (!a || !b) continue;
    svg.append(element("path", {d:`M ${a.x} ${a.y} C ${(a.x+b.x)/2} ${a.y}, ${(a.x+b.x)/2} ${b.y}, ${b.x} ${b.y}`, fill:"none", stroke:edge.kind === "observed-deny" ? "#c8d3e3" : "#a6bddf", "stroke-width":1.5, "stroke-dasharray":edge.kind === "observed-deny" ? "4 5" : "none", opacity:.65}));
  }
  for (const node of nodes) {
    const pos = positions.get(node.id); if (!pos) continue;
    const endpoint = node.kind === "endpoint", width = endpoint ? 270 : node.kind === "permission" ? 215 : 150;
    const color = node.has_finding ? "#d9767c" : colors[node.kind];
    const group = element("g", {"data-key":node.label});
    if (endpoint) {group.setAttribute("tabindex","0"); group.setAttribute("role","button");group.setAttribute("aria-label", `Inspect ${node.label}`);group.style.cursor="pointer";}
    group.append(element("rect", {x:pos.x-width/2,y:pos.y-23,width,height:46,rx:8,fill:node.has_finding?"#fff5f4":"#fff",stroke:color,"stroke-width":1.5}));
    group.append(element("circle", {cx:pos.x-width/2+15,cy:pos.y,r:3,fill:color}));
    const label = element("text", {x:pos.x+4,y:pos.y+4,"text-anchor":"middle",fill:node.has_finding?"#b9666b":"#607491","font-size":endpoint?12:11,"font-family":"ui-monospace,monospace"});
    label.textContent=node.label.length>31 ? node.label.slice(0,29)+"…" : node.label;
    const title=element("title");title.textContent=node.label;group.append(title,label);
    if(endpoint){group.addEventListener("click",()=>showEndpoint(node.label));group.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();showEndpoint(node.label);}});}
    svg.append(group);
  }
}

function htmlNode(name, text, className) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showEndpoint(key) {
  if (!currentReport) return;
  const endpoint = currentReport.endpoints.find((item) => item.key === key);
  if (!endpoint) return;

  const detailBody = detailPanel.querySelector(".detail-body");
  if (!detailBody) return;
  detailBody.replaceChildren();

  svg.querySelectorAll('g[data-key]').forEach(group => {
    const selected = group.getAttribute('data-key') === key;
    if (group.getAttribute('role') === 'button') {
      group.setAttribute('aria-pressed', String(selected));
      group.querySelector('rect').setAttribute('stroke-width', selected ? '3' : '1.5');
    }
  });

  const isUndoc = endpoint.undocumented;
  const statusBanner = htmlNode(
    "div",
    isUndoc ? "⚠️ UNDOCUMENTED ROUTE (MISSING FROM OPENAPI)" : "✓ DOCUMENTED IN SPECIFICATION",
    `route-status ${isUndoc ? "undocumented" : "documented"}`
  );
  detailBody.append(statusBanner);

  // Key
  detailBody.append(htmlNode("div", endpoint.key, "detail-key"));

  // Source tags
  const tags = htmlNode("div", undefined, "tags");
  (endpoint.sources || []).forEach((src) => {
    tags.append(htmlNode("span", src, "tag"));
  });
  if (isUndoc) tags.append(htmlNode("span", "HIDDEN", "tag hidden"));
  detailBody.append(tags);

  // Policy block (Technical datasheet format)
  const policyBlock = htmlNode("div", undefined, "policy-block");
  const pHeader = htmlNode("div", "POLICY SPECIFICATION", "policy-block-header");
  const pBody = htmlNode("div", undefined, "policy-block-body");

  if (endpoint.policy) {
    const pObj = htmlNode("div", undefined, "policy-row");
    pObj.append(htmlNode("span", "OBJECT", "policy-key"));
    pObj.append(htmlNode("span", endpoint.policy.object, "policy-val mono"));
    pBody.append(pObj);

    const pPerm = htmlNode("div", undefined, "policy-row");
    pPerm.append(htmlNode("span", "PERM", "policy-key"));
    pPerm.append(htmlNode("span", endpoint.policy.permission, "policy-val mono"));
    pBody.append(pPerm);

    const pAllow = htmlNode("div", undefined, "policy-row");
    pAllow.append(htmlNode("span", "ALLOWED", "policy-key"));
    pAllow.append(htmlNode("span", (endpoint.policy.allowed_identities || []).join(", "), "policy-val mono"));
    pBody.append(pAllow);

    if (endpoint.policy.owasp) {
      const owasp = htmlNode("div", endpoint.policy.owasp, "owasp-tag");
      pBody.append(owasp);
    }
  } else {
    pBody.append(htmlNode("p", "No manual policy specified. Endpoint correlation only.", "mono"));
  }

  policyBlock.append(pHeader, pBody);
  detailBody.append(policyBlock);

  // Observations
  const obsTitle = htmlNode("div", "OBSERVED RESPONSES", "policy-block-header");
  obsTitle.style.marginBottom = "0.75rem";
  detailBody.append(obsTitle);

  (endpoint.observations || []).forEach((obs) => {
    const unexpected = obs.expected === "deny" && obs.granted;
    const card = htmlNode("div", undefined, `obs-card ${unexpected ? "unexpected" : ""}`);

    const header = htmlNode("div", undefined, "obs-header");
    header.append(htmlNode("span", `${obs.identity} [${obs.role}]`, "obs-identity"));
    header.append(htmlNode("span", `HTTP ${obs.status ?? "ERR"} · EXP: ${(obs.expected || "unknown").toUpperCase()}`, "obs-status"));
    card.append(header);

    if (unexpected) {
      card.append(htmlNode("div", "POLICY MISMATCH: Access granted to an identity expected to be denied", "obs-alert"));
    }

    const bodyBlock = htmlNode("div", undefined, "obs-body-block");
    bodyBlock.append(htmlNode("div", "RESPONSE BODY (SENSITIVE FIELDS REDACTED)", "obs-body-label"));

    const pre = document.createElement("pre");
    const jsonStr = JSON.stringify(obs.body ?? obs.error ?? {}, null, 2);
    
    // Highlight <redacted> inside code blocks
    if (jsonStr.includes("<redacted>")) {
      const parts = jsonStr.split("<redacted>");
      parts.forEach((part, idx) => {
        pre.appendChild(document.createTextNode(part));
        if (idx < parts.length - 1) {
          const mark = document.createElement("span");
          mark.className = "redacted-mark";
          mark.textContent = "<redacted>";
          pre.appendChild(mark);
        }
      });
    } else {
      pre.textContent = jsonStr;
    }

    bodyBlock.append(pre);
    card.append(bodyBlock);
    detailBody.append(card);
  });
}

function renderFindings(findings) {
  if (!findingsSection || !findingsList) return;
  if (!findings || findings.length === 0) {
    findingsSection.style.display = "block";
    findingsBadge.textContent = "0";
    findingsList.replaceChildren(htmlNode("p", "No policy violations were found in this assessment. Untested endpoints are not verified.", "detail-placeholder"));
    return;
  }

  findingsSection.style.display = "block";
  if (findingsBadge) findingsBadge.textContent = `${findings.length} DETECTED`;
  findingsList.replaceChildren();

  // Header row
  const hRow = htmlNode("div", undefined, "finding-row header-row");
  hRow.append(htmlNode("div", "FINDING ID", "finding-cell"));
  hRow.append(htmlNode("div", "TITLE & TARGET", "finding-cell"));
  hRow.append(htmlNode("div", "SEVERITY", "finding-cell"));
  hRow.append(htmlNode("div", "UNAUTHORIZED IDENTITIES", "finding-cell"));
  findingsList.append(hRow);

  findings.forEach((f) => {
    const row = htmlNode("div", undefined, "finding-row");
    row.append(htmlNode("div", f.id, "finding-cell finding-id"));

    const info = htmlNode("div", undefined, "finding-cell");
    info.append(htmlNode("div", f.title, "finding-title"));
    info.append(htmlNode("div", `${f.category} — ${f.endpoint}`, "finding-endpoint"));
    row.append(info);

    const sevCell = htmlNode("div", undefined, "finding-cell");
    const sevBadge = htmlNode("span", (f.severity || "MEDIUM").toUpperCase(), `sev-badge sev-${(f.severity || "medium").toLowerCase()}`);
    sevCell.append(sevBadge);
    row.append(sevCell);

    const idCell = htmlNode("div", undefined, "finding-cell finding-identities");
    idCell.textContent = (f.unexpected_identities || []).join(", ") || "—";
    row.append(idCell);

    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Inspect ${f.title}`);
    const inspect = () => { switchView("graph"); showEndpoint(f.endpoint); detailPanel.scrollIntoView({behavior:"smooth", block:"nearest"}); };
    row.addEventListener("click", inspect);
    row.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " ") { e.preventDefault(); inspect(); } });
    findingsList.append(row);
  });
}

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  setText("#page-name", {overview:"Overview",graph:"Endpoint explorer",findings:"Findings",report:"Security report"}[view]);
  document.querySelector("#overview-content").hidden = view !== "overview";
  document.querySelector("#graph-section").hidden = !["overview", "graph"].includes(view);
  findingsSection.hidden = !["overview", "findings"].includes(view);
  document.querySelector("#report-section").hidden = view !== "report";
}
function renderReport() {
  const report = currentReport, body = document.querySelector("#report-content");
  body.replaceChildren();
  setText("#report-target", `${report.metadata?.target || "Imported target"} · Generated ${report.metadata?.generated_at || "date unavailable"}`);
  const block = (title, text) => {const div=htmlNode("article", undefined, "report-block");div.append(htmlNode("h3", title),htmlNode("p",text));body.append(div);return div;};
  if (report.metadata?.sample) block("SIMULATED ASSESSMENT", "This is a fictional example website with synthetic endpoints, responses and findings. No network scan was performed. Use Import report to view real assessment evidence.");
  block("01 / Executive summary", `${report.summary.endpoint_count} endpoints discovered, including ${report.summary.undocumented_count} undocumented routes. ${report.summary.tested_count} endpoints were tested against configured identity policies, producing ${report.findings.length} findings. Results describe this saved assessment only; untested routes and missing policies do not imply safety.`);
  block("02 / Scope & methodology", `Discovery sources: ${[...new Set(report.endpoints.flatMap(e=>e.sources || []))].join(", ") || "Not specified"}. Authorization checks compare expected policy with observed responses. Safety mode: ${report.metadata?.safety_mode || "Not specified"}. Response bodies shown in the inspector are taken from the imported evidence.`);
  block("03 / Findings & remediation", report.findings.length ? "Prioritize the access-control violations below, then repeat the assessment after remediation." : "No findings recorded. Review test coverage before drawing conclusions.");
  report.findings.forEach(f=>{const div=block(`${f.id} · ${f.title}`, `${f.category || "Access-control mismatch"} · ${f.endpoint} · Unexpected identities: ${(f.unexpected_identities || []).join(", ") || "None listed"}.`);div.querySelector("h3").append(htmlNode("span", f.severity || "medium", `sev-badge sev-${f.severity || "medium"}`));div.append(htmlNode("p", `Remediation: ${f.remediation || "Review and enforce the expected authorization policy."}`));const evidence=htmlNode("pre",JSON.stringify(f.evidence || [], null, 2));div.append(evidence);});
  block("04 / Endpoint inventory", report.endpoints.map(e=>`${e.key} — ${e.undocumented ? "Undocumented" : "Documented"} · ${(e.observations || []).length} observations`).join("\n")).lastChild.style.whiteSpace="pre-line";
}

document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelector("#view-report").addEventListener("click",()=>{if(currentReport) switchView("report");else statusBar.textContent="Import an explorer report to view the assessment.";});
document.querySelector("#explore-button").addEventListener("click",()=>{switchView("graph");document.querySelector("#graph-section").scrollIntoView({behavior:"smooth"});});
document.querySelector("#target-select").addEventListener("change", e=>loadReport(reports.get(e.target.value)));
document.querySelector("#graph-filter").addEventListener("change",()=>{if(currentReport)drawGraph(currentReport.graph);});
document.querySelector("#print-report").addEventListener("click",()=>window.print());
document.querySelector("#download-json").addEventListener("click",()=>{if(!currentReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(currentReport,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="veil-security-report.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.querySelector("#report-file").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{registerReport(JSON.parse(await file.text()),file.name);}catch(err){statusBar.textContent="Import failed: "+err.message;}finally{e.target.value="";}});
// Fictional reserved .example domains provide selectable scenarios without scanning third parties.
const sampleWebsites = [
  ["Northstar Commerce", "shop.northstar.example", "products", "orders", "customers", 2],
  ["Orbit SaaS", "app.orbit.example", "plans", "workspaces", "members", 1],
  ["Meridian Finance", "portal.meridian.example", "rates", "accounts", "transfers", 3],
  ["Evergreen Health", "care.evergreen.example", "services", "appointments", "patients", 2],
  ["Campus Learning", "learn.campus.example", "courses", "enrollments", "students", 1],
  ["Atlas Travel", "book.atlas.example", "destinations", "bookings", "travelers", 2],
  ["Parcel Logistics", "track.parcel.example", "locations", "shipments", "recipients", 3],
  ["Gather Social", "community.gather.example", "posts", "messages", "profiles", 2],
  ["Beacon Analytics", "dash.beacon.example", "metrics", "dashboards", "exports", 1],
  ["Cedar Workspace", "team.cedar.example", "templates", "projects", "documents", 0],
  ["Pixel Media", "studio.pixel.example", "collections", "assets", "licenses", 2],
  ["Launch Developer Portal", "dev.launch.example", "status", "applications", "keys", 3],
];

function createSampleReport([name, host, catalog, records, resource, violations]) {
  const identities = ["anonymous", "member", "admin"];
  const definitions = [
    [`/api/${catalog}`, "read:public", catalog, false, []],
    ["/api/me", "read:own", "profile", false, []],
    [`/api/${records}/{id}`, "read:own-or-admin", records, false, violations >= 1 ? ["anonymous"] : []],
    [`/api/admin/${resource}`, "read:admin", resource, true, violations >= 2 ? ["member"] : []],
    ["/api/internal/config", "read:admin", "runtime-config", true, violations >= 3 ? ["anonymous", "member"] : []],
  ];
  const nodes = identities.map(role => ({id:`role:${role}`, kind:"role", label:role}));
  const edges = [], findings = [];
  const endpoints = definitions.map(([path, permission, object, undocumented, unexpected], index) => {
    const key = `GET ${path}`, endpointId = `endpoint:${key}`;
    const allowed = permission === "read:public" ? identities : permission === "read:admin" ? ["admin"] : ["member", "admin"];
    const observations = identities.map(identity => {
      const expected = allowed.includes(identity) ? "allow" : "deny";
      const granted = expected === "allow" || unexpected.includes(identity);
      return {identity, role:identity, expected, granted, status:granted ? 200 : identity === "anonymous" ? 401 : 403,
        body:granted ? {sample:true, resource:object, message:"Synthetic example response"} : {sample:true, error:"Access denied"}};
    });
    nodes.push({id:endpointId, kind:"endpoint", label:key, undocumented, has_finding:unexpected.length > 0},
      {id:`object:${object}`, kind:"object", label:object});
    if (!nodes.some(n => n.id === `permission:${permission}`)) nodes.push({id:`permission:${permission}`,kind:"permission",label:permission});
    edges.push({source:`permission:${permission}`,target:endpointId,kind:"requires"}, {source:endpointId,target:`object:${object}`,kind:"exposes"});
    observations.forEach(obs => edges.push({source:`role:${obs.role}`,target:endpointId,kind:obs.granted ? "observed-allow" : "observed-deny"}));
    const category = index === 2 ? "API1:2023 Broken Object Level Authorization" : index === 3 ? "API5:2023 Broken Function Level Authorization" : "API9:2023 Improper Inventory Management";
    if (unexpected.length) findings.push({id:`DEMO-${String(findings.length+1).padStart(3,"0")}`,title:`Unexpected access to ${key}`,endpoint:key,
      severity:index === 4 ? "medium" : "high",category,unexpected_identities:unexpected,
      evidence:observations.filter(o => unexpected.includes(o.identity)).map(o => ({identity:o.identity,status:o.status,sample:true})),
      remediation:index === 2 ? "Verify resource ownership for every request before returning a record." : "Restrict this route to administrators and add regression coverage for denied identities."});
    return {key,method:"GET",path,undocumented,sources:undocumented ? ["javascript"] : ["openapi", "javascript"],
      policy:{object,permission,allowed_identities:allowed,owasp:index >= 2 ? category : null},observations};
  });
  return {metadata:{target:`https://${host}`,name,sample:true,safety_mode:"synthetic-offline-example"},
    summary:{endpoint_count:endpoints.length,undocumented_count:2,tested_count:endpoints.length,finding_count:findings.length},endpoints,findings,graph:{nodes,edges}};
}
sampleWebsites.forEach(website => registerReport(createSampleReport(website), `${website[0]} · Sample`, false));
fetch("../artifacts/demo-report.json")
  .then(r => { if(!r.ok) throw new Error("No bundled report available"); return r.json(); })
  .then(r => registerReport(r, "Local demo", !currentReport))
  .catch(() => { if(!currentReport) { const first = reports.keys().next().value; document.querySelector("#target-select").value = first; loadReport(reports.get(first)); } });
