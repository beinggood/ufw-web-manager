/* ---------- low-level helpers ---------- */

async function api(url, options={}){
  const r = await fetch(url, {headers:{"Content-Type":"application/json"}, ...options});
  return await r.json();
}

function toast(s, ok=true){
  const e = document.getElementById("toast");
  e.textContent = s;
  e.style.display = "block";
  e.style.borderLeftColor = ok ? "var(--accent)" : "var(--danger)";
  e.style.animation = "none"; void e.offsetWidth; e.style.animation = "";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { e.style.display = "none"; }, 3500);
}

function escapeHtml(s){
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

async function withLoading(btn, fn){
  if (btn.classList.contains("is-loading")) return;
  btn.classList.add("is-loading");
  try { await fn(); }
  finally { btn.classList.remove("is-loading"); }
}

function spinRefresh(btn){
  btn.classList.remove("is-spinning");
  void btn.offsetWidth;
  btn.classList.add("is-spinning");
}

/* ---------- console syntax highlighting ---------- */

function highlight(text){
  let h = escapeHtml(text);
  h = h.replace(/\bALLOW\b/g, '<span class="tok-allow">ALLOW</span>');
  h = h.replace(/\b(DENY|REJECT)\b/g, '<span class="tok-deny">$1</span>');
  h = h.replace(/\bLIMIT\b/g, '<span class="tok-limit">LIMIT</span>');
  h = h.replace(/Status:\s*active/i, () => `Status: <span class="tok-active">active</span>`);
  h = h.replace(/Status:\s*inactive/i, () => `Status: <span class="tok-inactive">inactive</span>`);
  h = h.replace(/^(\[\s*\d+\])/gm, '<span class="tok-num">$1</span>');
  return h;
}

function setStatusPill(text){
  const pill = document.getElementById("statusPill");
  const active = /Status:\s*active/i.test(text || "");
  const inactive = /Status:\s*inactive/i.test(text || "");
  pill.classList.remove("is-active", "is-inactive");
  if (active){ pill.classList.add("is-active"); pill.innerHTML = '<span class="dot"></span>UFW 已启用'; }
  else if (inactive){ pill.classList.add("is-inactive"); pill.innerHTML = '<span class="dot"></span>UFW 已禁用'; }
  else { pill.innerHTML = '<span class="dot"></span>状态未知'; }
}

/* ---------- rule list parsing (client-side only; API untouched) ---------- */

function parseRules(text){
  const lines = (text || "").split("\n");
  const rows = [];
  const re = /^\[\s*(\d+)\]\s+(.*?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT))?\s+(.*)$/;
  for (const line of lines){
    const m = line.match(re);
    if (m){
      rows.push({ num: m[1], to: m[2].trim(), action: m[3], dir: m[4] || "", from: m[5].trim() });
    }
  }
  return rows;
}

function toneFor(action){
  if (action === "ALLOW") return "allow";
  if (action === "LIMIT") return "limit";
  return "deny";
}

function renderRuleCards(text){
  const wrap = document.getElementById("ruleCards");
  const rows = parseRules(text);

  if (!rows.length){
    const msg = /Status:\s*inactive/i.test(text || "") ? "UFW 当前已禁用，没有生效的规则。"
              : "暂无规则。可在“新增规则”里添加第一条。";
    wrap.innerHTML = `<div class="empty-hint">${msg}</div>`;
    return;
  }

  wrap.innerHTML = rows.map((r, i) => `
    <div class="rule-card" style="animation-delay:${i * 35}ms" data-num="${r.num}">
      <div class="rule-num">#${r.num}</div>
      <div class="rule-badge ${toneFor(r.action)}">${r.action}</div>
      <div class="rule-detail">
        <div class="rule-to">${escapeHtml(r.to)}</div>
        <div class="rule-from">from ${escapeHtml(r.from)}</div>
      </div>
      <div class="rule-dir">${r.dir}</div>
      <button class="rule-delete" title="删除规则 #${r.num}" onclick="deleteRuleCard(this, '${r.num}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>
  `).join("");
}

/* ---------- data loading ---------- */

async function loadStatus(){
  const d = await api("/api/status");
  const text = d.stdout || d.stderr || "无输出";
  document.getElementById("status").innerHTML = highlight(text);
  setStatusPill(d.stdout || "");
}

async function loadRules(){
  const d = await api("/api/rules");
  const text = d.stdout || d.stderr || "无输出";
  document.getElementById("rules").innerHTML = highlight(text);
  renderRuleCards(text);
  syncCollapsibleHeight();
}

async function reloadAll(){ await Promise.all([loadStatus(), loadRules()]); }

async function doAction(url){
  const d = await api(url, {method:"POST", body:"{}"});
  toast(d.ok ? "操作成功" : (d.stderr || "操作失败"), d.ok);
  await reloadAll();
}

async function enableUfw(){
  if (confirm("启用 UFW 前请确认 SSH 端口已允许，否则可能断开远程连接。确定继续？")) await doAction("/api/enable");
}
async function disableUfw(){
  if (confirm("确定禁用 UFW？")) await doAction("/api/disable");
}

async function savePolicies(){
  for (const name of ["incoming","outgoing","routed"]){
    const val = document.querySelector(`input[name="${name}"]:checked`).value;
    const d = await api("/api/default", {method:"POST", body: JSON.stringify({direction: name, policy: val})});
    if (!d.ok){ toast(d.stderr || "失败", false); return; }
  }
  toast("默认策略已应用");
  await reloadAll();
}

async function addRule(){
  const payload = {
    action: document.querySelector('input[name="action"]:checked').value,
    direction: document.querySelector('input[name="direction"]:checked').value,
    protocol: document.querySelector('input[name="protocol"]:checked').value,
    port: document.getElementById("port").value,
    from: document.getElementById("from").value,
    to: document.getElementById("to").value,
    comment: document.getElementById("comment").value,
  };
  const d = await api("/api/rule", {method:"POST", body: JSON.stringify(payload)});
  toast(d.ok ? "规则添加成功" : (d.stderr || "添加失败"), d.ok);
  if (d.ok){
    document.getElementById("port").value = "";
    document.getElementById("comment").value = "";
    await reloadAll();
  }
}

async function deleteRuleCard(btn, num){
  if (!confirm("确定删除规则 #" + num + "？")) return;
  const card = btn.closest(".rule-card");
  btn.disabled = true;
  const d = await api("/api/delete", {method:"POST", body: JSON.stringify({number: num})});
  if (!d.ok){ toast(d.stderr || "删除失败", false); btn.disabled = false; return; }
  toast("规则已删除");
  if (card){
    card.classList.add("is-removing");
    await new Promise(res => setTimeout(res, 200));
  }
  await reloadAll();
}

/* ---------- collapsible raw output ---------- */

function toggleRawOutput(){
  const box = document.getElementById("rawCollapsible");
  const btn = document.getElementById("toggleRawBtn");
  const open = box.classList.toggle("is-open");
  btn.classList.toggle("is-open", open);
  btn.lastChild.textContent = open ? " 隐藏原始输出" : " 显示原始输出";
}
function syncCollapsibleHeight(){ /* grid-template-rows handles sizing automatically */ }

/* ---------- view switching ---------- */

function moveNavIndicator(btn){
  const ind = document.getElementById("navIndicator");
  ind.style.width = btn.offsetWidth + "px";
  ind.style.height = btn.offsetHeight + "px";
  ind.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
}

function positionSegment(group){
  const checked = group.querySelector("input:checked");
  const label = checked && document.querySelector(`label[for="${checked.id}"]`);
  const indicator = group.querySelector(".segmented-indicator");
  if (!checked || !label || !indicator) return;
  indicator.style.width = label.offsetWidth + "px";
  indicator.style.transform = `translateX(${label.offsetLeft - 3}px)`;
}

function positionSegmentsIn(root){
  root.querySelectorAll(".segmented").forEach(positionSegment);
}

function switchView(view, btn){
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("is-active", n === btn));
  moveNavIndicator(btn);
  requestAnimationFrame(() => {
    const active = document.querySelector(`.view[data-view="${view}"]`);
    if (active) positionSegmentsIn(active);
  });
}

/* ---------- segmented control wiring ---------- */

function initSegmented(){
  document.querySelectorAll(".segmented").forEach(group => {
    group.addEventListener("change", e => {
      if (e.target.matches("input")) positionSegment(group);
    });
  });
  const actionGroup = document.querySelector('.segmented[data-name="action"]');
  if (actionGroup){
    const syncTone = () => {
      const val = document.querySelector('input[name="action"]:checked').value;
      actionGroup.dataset.tone = (val === "allow") ? "" : (val === "limit" ? "limit" : "deny");
    };
    actionGroup.addEventListener("change", syncTone);
    syncTone();
  }
}

/* ---------- init ---------- */

window.addEventListener("resize", () => {
  const activeNav = document.querySelector(".nav-item.is-active");
  if (activeNav) moveNavIndicator(activeNav);
  const activeView = document.querySelector(".view.is-active");
  if (activeView) positionSegmentsIn(activeView);
});

initSegmented();
requestAnimationFrame(() => {
  const activeNav = document.querySelector(".nav-item.is-active");
  if (activeNav) moveNavIndicator(activeNav);
  positionSegmentsIn(document.querySelector(".view.is-active"));
});
reloadAll();
