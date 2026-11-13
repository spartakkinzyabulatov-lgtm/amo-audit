// Аудит amoCRM от SolutionCRM. Всё работает в браузере, данные — в localStorage.
(function () {
  "use strict";

  // Ссылка для кнопки «Обсудить с SolutionCRM». Запасной вариант — сайт https://solution-crm.ru/
  var CONTACT_URL = "https://t.me/SpartakCRM";

  var STORAGE_KEY = "amo-audit-v1";
  var BLOCKS = window.AUDIT_BLOCKS || [];
  var ANSWERS = {
    yes: { label: "Да", score: 1 },
    part: { label: "Частично", score: 0.5 },
    no: { label: "Нет", score: 0 }
  };
  var WEIGHT_LABEL = { 3: "Критично", 2: "Важно", 1: "Желательно" };

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var state = load();
  var screen = "start";

  // ---------- хранение ----------
  function emptyState() {
    return { company: "", answers: {}, block: 0, updatedAt: null };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      return emptyState();
    }
  }
  function normalize(data) {
    var s = emptyState();
    if (!data || typeof data !== "object") return s;
    if (typeof data.company === "string") s.company = data.company.slice(0, 120);
    if (data.answers && typeof data.answers === "object") {
      allItems().forEach(function (it) {
        var v = data.answers[it.id];
        if (ANSWERS[v]) s.answers[it.id] = v;
      });
    }
    var b = parseInt(data.block, 10);
    if (b >= 0 && b < BLOCKS.length) s.block = b;
    s.updatedAt = data.updatedAt || null;
    return s;
  }
  function save() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Не получилось сохранить в браузере. Скачайте копию данных.");
    }
  }

  // ---------- расчёты ----------
  function allItems() {
    var list = [];
    BLOCKS.forEach(function (b, bi) {
      b.items.forEach(function (it) { list.push(Object.assign({ block: bi }, it)); });
    });
    return list;
  }
  function answeredCount(items) {
    return items.filter(function (it) { return state.answers[it.id]; }).length;
  }
  // Оценка с учётом важности, по отвеченным пунктам. null — ничего не отвечено.
  function score(items) {
    var sum = 0, max = 0;
    items.forEach(function (it) {
      var a = state.answers[it.id];
      if (!a) return;
      sum += ANSWERS[a].score * it.weight;
      max += it.weight;
    });
    return max ? Math.round((sum / max) * 100) : null;
  }
  function level(pct) {
    if (pct === null) return "none";
    if (pct >= 75) return "good";
    if (pct >= 50) return "mid";
    return "bad";
  }
  function levelText(pct) {
    return { good: "Хорошо", mid: "Есть что улучшить", bad: "Нужна доработка", none: "Нет ответов" }[level(pct)];
  }
  function fixList() {
    return allItems()
      .filter(function (it) { var a = state.answers[it.id]; return a === "no" || a === "part"; })
      .sort(function (x, y) {
        if (y.weight !== x.weight) return y.weight - x.weight;
        var ax = state.answers[x.id] === "no" ? 0 : 1, ay = state.answers[y.id] === "no" ? 0 : 1;
        if (ax !== ay) return ax - ay;
        return x.block - y.block;
      });
  }

  // ---------- утилиты ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2800);
  }
  function go(name) {
    screen = name;
    render();
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  // ---------- воронка прогресса ----------
  function pipelineHTML(mode) {
    return '<ol class="pipeline pipeline-' + mode + '">' + BLOCKS.map(function (b, i) {
      var done = answeredCount(b.items), total = b.items.length;
      var fill, label, lv = "none";
      if (mode === "result") {
        var p = score(b.items);
        lv = level(p);
        fill = p === null ? 0 : p;
        label = p === null ? "—" : p + " %";
      } else {
        fill = Math.round((done / total) * 100);
        label = done + "/" + total;
      }
      var cur = mode === "check" && i === state.block ? " is-current" : "";
      return '<li class="stage lv-' + lv + cur + '">' +
        '<button type="button" class="stage-btn" data-action="jump" data-block="' + i + '" ' + (mode === "start" ? 'tabindex="-1" ' : "") +
        'aria-label="Блок ' + (i + 1) + ": " + esc(b.title) + ", " + label + '"' + (cur ? ' aria-current="step"' : "") + '>' +
        '<span class="stage-fill" style="width:' + fill + '%"></span>' +
        '<span class="stage-num">' + (i + 1) + '</span>' +
        '<span class="stage-name">' + esc(b.short) + '</span>' +
        '<span class="stage-val">' + label + '</span>' +
        '</button></li>';
    }).join("") + "</ol>";
  }

  // ---------- экраны ----------
  function renderStart() {
    var items = allItems(), done = answeredCount(items);
    var started = done > 0;
    app.innerHTML =
      '<section class="start">' +
        '<h1 class="start-title">Как настроена ваша amoCRM?</h1>' +
        '<p class="lead">' + items.length + ' вопросов в шести блоках: от воронок до аналитики. На каждый отвечаете «Да», «Частично» или «Нет». ' +
        'Через 10–15 минут получите оценку и список, что исправить в первую очередь.</p>' +
        '<div class="start-preview" aria-hidden="true">' + pipelineHTML("start") + '</div>' +
        '<label class="field">' +
          '<span class="field-label">Название компании <span class="muted">— необязательно, для заголовка результата</span></span>' +
          '<input type="text" id="company" maxlength="120" autocomplete="organization" placeholder="Например, ООО «Ромашка»" value="' + esc(state.company) + '">' +
        '</label>' +
        '<div class="actions">' +
          (started
            ? '<button type="button" class="btn btn-primary" data-action="continue">Продолжить</button>' +
              '<button type="button" class="btn btn-ghost" data-action="begin">Начать аудит заново</button>'
            : '<button type="button" class="btn btn-primary" data-action="begin">Начать аудит</button>') +
        '</div>' +
        (started ? '<p class="muted resume-note">Отвечено ' + done + ' из ' + items.length + '. Ответы сохранены на этом устройстве.</p>' : "") +
        '<p class="muted privacy">Ответы никуда не отправляются: они хранятся только в вашем браузере.</p>' +
      '</section>';
  }

  function itemHTML(it) {
    var a = state.answers[it.id] || "";
    return '<li class="item' + (a ? " answered a-" + a : "") + '" data-item="' + it.id + '">' +
      '<p class="item-q">' + esc(it.q) + '</p>' +
      '<button type="button" class="hint-toggle" data-action="hint" aria-expanded="false" aria-controls="hint-' + it.id + '">Как проверить</button>' +
      '<p class="hint" id="hint-' + it.id + '" hidden>' + esc(it.how) + '</p>' +
      '<div class="answers" role="group" aria-label="Ответ">' +
        Object.keys(ANSWERS).map(function (k) {
          return '<button type="button" class="ans ans-' + k + '" data-action="answer" data-id="' + it.id + '" data-value="' + k + '" aria-pressed="' + (a === k) + '">' + ANSWERS[k].label + "</button>";
        }).join("") +
      "</div></li>";
  }

  function renderCheck() {
    var b = BLOCKS[state.block];
    var items = allItems(), done = answeredCount(items);
    var last = state.block === BLOCKS.length - 1;
    app.innerHTML =
      '<section class="check">' +
        '<div class="progress-head">' +
          '<p class="progress-text" id="progressText">Пройдено ' + done + ' из ' + items.length + '</p>' +
        '</div>' +
        '<nav aria-label="Блоки чек-листа" id="pipelineWrap">' + pipelineHTML("check") + '</nav>' +
        '<h2 class="block-title"><span class="block-num">Блок ' + (state.block + 1) + ' из ' + BLOCKS.length + '</span>' + esc(b.title) + '</h2>' +
        '<p class="muted tip">Нажмите на выбранный ответ ещё раз, чтобы его снять.</p>' +
        '<ol class="items">' + b.items.map(itemHTML).join("") + '</ol>' +
        '<div class="nav-row">' +
          (state.block > 0 ? '<button type="button" class="btn btn-ghost" data-action="prev">Назад</button>' : '<button type="button" class="btn btn-ghost" data-action="home">На старт</button>') +
          (last ? "" : '<button type="button" class="btn btn-secondary" data-action="next">Дальше</button>') +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-wide" data-action="result">Показать результат</button>' +
      '</section>';
  }

  function renderResult() {
    var items = allItems(), done = answeredCount(items);
    var total = score(items), lv = level(total);
    var fixes = fixList();
    var title = state.company ? "Аудит amoCRM: " + esc(state.company) : "Результат аудита amoCRM";
    app.innerHTML =
      '<section class="result">' +
        '<h1 class="result-title">' + title + '</h1>' +
        '<div class="score score-' + lv + '">' +
          '<p class="score-num">' + (total === null ? "—" : total + '<span class="pct">%</span>') + '</p>' +
          '<div class="score-meta"><p class="score-level">' + levelText(total) + '</p>' +
          '<p class="muted">Отвечено ' + done + ' из ' + items.length + (done < items.length ? ". Оценка — по отвеченным пунктам." : "") + '</p></div>' +
        '</div>' +
        '<h2 class="section-title">По блокам</h2>' +
        pipelineHTML("result") +
        '<ul class="block-scores">' + BLOCKS.map(function (b) {
          var p = score(b.items);
          return '<li class="lv-' + level(p) + '"><span>' + esc(b.title) + '</span><b>' + (p === null ? "нет ответов" : p + " %") + "</b></li>";
        }).join("") + '</ul>' +
        '<h2 class="section-title">Что исправить</h2>' +
        (fixes.length
          ? '<ol class="fixes">' + fixes.map(function (it) {
              var a = state.answers[it.id];
              return '<li class="fix fix-' + a + '"><span class="fix-tag">' + ANSWERS[a].label + ", " + WEIGHT_LABEL[it.weight].toLowerCase() + '</span>' +
                '<p class="fix-q">' + esc(it.q) + '</p><p class="fix-block muted">' + esc(BLOCKS[it.block].title) + "</p></li>";
            }).join("") + "</ol>"
          : '<p class="empty-fixes">' + (done ? "Пунктов с ответом «Нет» или «Частично» нет. Отличная работа." : "Пока нет ответов. Вернитесь к чек-листу и ответьте на вопросы.") + "</p>") +
        '<div class="actions result-actions">' +
          '<button type="button" class="btn btn-primary" data-action="copy">Скопировать результат</button>' +
          '<button type="button" class="btn btn-secondary" data-action="contact">Обсудить с SolutionCRM</button>' +
          '<button type="button" class="btn btn-ghost" data-action="edit">Вернуться к ответам</button>' +
          '<button type="button" class="btn btn-ghost btn-danger" data-action="reset">Начать заново</button>' +
        '</div>' +
      '</section>';
  }

  function render() {
    if (screen === "check") renderCheck();
    else if (screen === "result") renderResult();
    else renderStart();
  }

  // ---------- текст для копирования ----------
  function resultText() {
    var items = allItems(), total = score(items);
    var lines = [];
    lines.push(state.company ? "Аудит amoCRM: " + state.company : "Аудит amoCRM");
    lines.push("Общая оценка: " + (total === null ? "нет ответов" : total + " % (" + levelText(total).toLowerCase() + ")"));
    lines.push("Отвечено: " + answeredCount(items) + " из " + items.length);
    lines.push("");
    lines.push("По блокам:");
    BLOCKS.forEach(function (b) {
      var p = score(b.items);
      lines.push("• " + b.title + ": " + (p === null ? "нет ответов" : p + " %"));
    });
    var fixes = fixList();
    lines.push("");
    if (fixes.length) {
      lines.push("Что исправить:");
      fixes.forEach(function (it, i) {
        lines.push((i + 1) + ". " + it.q + " (" + ANSWERS[state.answers[it.id]].label.toLowerCase() + ", " + WEIGHT_LABEL[it.weight].toLowerCase() + ")");
      });
    } else {
      lines.push("Что исправить: замечаний нет.");
    }
    lines.push("");
    lines.push("Чек-лист SolutionCRM");
    return lines.join("\n");
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? "Результат скопирован. Вставьте его в отчёт или мессенджер." : "Не получилось скопировать. Выделите текст вручную.");
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Результат скопирован. Вставьте его в отчёт или мессенджер.");
      }, fallback);
    } else {
      fallback();
    }
  }

  // ---------- копия данных ----------
  function exportData() {
    var data = Object.assign({ app: "amo-audit", version: 1 }, state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    var d = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = "amo-audit_" + d + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("Копия данных скачана.");
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) {
        toast("Файл не читается. Выберите копию, скачанную из этого приложения.");
        return;
      }
      if (!data || data.app !== "amo-audit" || typeof data.answers !== "object") {
        toast("Это не копия аудита. Выберите файл amo-audit_….json.");
        return;
      }
      if (answeredCount(allItems()) > 0 && !confirm("Заменить текущие ответы данными из файла?")) return;
      state = normalize(data);
      save();
      toast("Копия загружена: " + answeredCount(allItems()) + " ответов.");
      render();
    };
    reader.readAsText(file);
  }

  // ---------- действия ----------
  function setAnswer(id, value) {
    if (state.answers[id] === value) delete state.answers[id];
    else state.answers[id] = value;
    save();
    var li = app.querySelector('[data-item="' + id + '"]');
    if (li) {
      var a = state.answers[id] || "";
      li.className = "item" + (a ? " answered a-" + a : "");
      li.querySelectorAll(".ans").forEach(function (btn) {
        btn.setAttribute("aria-pressed", String(btn.dataset.value === a));
      });
    }
    var items = allItems();
    var pt = document.getElementById("progressText");
    if (pt) pt.textContent = "Пройдено " + answeredCount(items) + " из " + items.length;
    var pw = document.getElementById("pipelineWrap");
    if (pw) pw.innerHTML = pipelineHTML("check");
  }

  function resetAll() {
    state = emptyState();
    save();
  }

  app.addEventListener("input", function (e) {
    if (e.target.id === "company") {
      state.company = e.target.value;
      save();
    }
  });

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.dataset.action;
    switch (act) {
      case "home": e.preventDefault(); go("start"); break;
      case "begin":
        if (answeredCount(allItems()) > 0 && !confirm("Начать заново? Все ответы будут стёрты.")) return;
        var company = state.company;
        resetAll();
        state.company = company;
        save();
        go("check");
        break;
      case "continue": go("check"); break;
      case "answer": setAnswer(el.dataset.id, el.dataset.value); break;
      case "hint":
        var hint = document.getElementById(el.getAttribute("aria-controls"));
        var open = el.getAttribute("aria-expanded") === "true";
        el.setAttribute("aria-expanded", String(!open));
        hint.hidden = open;
        break;
      case "jump":
        if (screen === "start") return;
        state.block = parseInt(el.dataset.block, 10); save(); go("check"); break;
      case "prev": state.block = Math.max(0, state.block - 1); save(); go("check"); break;
      case "next": state.block = Math.min(BLOCKS.length - 1, state.block + 1); save(); go("check"); break;
      case "result": go("result"); break;
      case "edit": go("check"); break;
      case "copy": copyText(resultText()); break;
      case "contact":
        if (CONTACT_URL) window.open(CONTACT_URL, "_blank", "noopener");
        else toast("Ссылка для связи пока не настроена.");
        break;
      case "reset":
        if (!confirm("Начать заново? Все ответы и название компании будут стёрты.")) return;
        resetAll();
        toast("Ответы очищены.");
        go("start");
        break;
      case "export": exportData(); break;
    }
  });

  document.getElementById("importFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = "";
  });

  render();
})();
