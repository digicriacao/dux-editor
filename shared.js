/* ============ DUX Ferramentas - JavaScript compartilhado ============ */

// ===== GitHub Gist config =====
// O Gist ID NÃO é secreto (é só um identificador de URL). Pode ficar no código.
const GIST_ID = 'd35f1173dab7eb9fe5a6cf8c8cfb364e';

// O token é secreto — fica no localStorage do navegador, NUNCA no código público.
// (Quando o token vai para um repositório público, o GitHub revoga automaticamente.)
function getGistToken() {
  return localStorage.getItem('dux_gist_token') || '';
}
function setGistToken(token) {
  localStorage.setItem('dux_gist_token', token);
}
function clearGistToken() {
  localStorage.removeItem('dux_gist_token');
}

const GIST_API = `https://api.github.com/gists/${GIST_ID}`;
function gistHeaders(write) {
  const h = {
    'Authorization': `Bearer ${getGistToken()}`,
    'Accept': 'application/vnd.github+json'
  };
  if (write) h['Content-Type'] = 'application/json';
  return h;
}

// ===== Utils =====
window.$ = (s, ctx) => (ctx || document).querySelector(s);
window.$$ = (s, ctx) => (ctx || document).querySelectorAll(s);

window.escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
window.escapeAttr = (s) => String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

window.showToast = function(msg, dur) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), dur || 1800);
};

window.copyText = async function(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta); return true;
  }
};

window.downloadFile = function(content, filename, mime) {
  const blob = new Blob([content], { type: mime || 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};

// ============ GitHub Gist Storage ============
// Estrutura do Gist:
//   receitas.json → { "Nome da receita": { ...dados }, ... }
//   news.json     → { "Nome da news":    { ...dados }, ... }

// Cache em memória para evitar fetches repetidos
let _gistCache = null;

async function _readGist() {
  if (!getGistToken()) throw new Error('Token não configurado. Clique em "⚙ Configurar token" no topo.');
  const res = await fetch(GIST_API, { headers: gistHeaders(false) });
  if (!res.ok) {
    if (res.status === 401) {
      clearGistToken();
      throw new Error('Token inválido ou expirado. Clique em "⚙ Configurar token" e insira um token novo.');
    }
    throw new Error(`Gist read error: ${res.status}`);
  }
  const gist = await res.json();
  _gistCache = {
    receita: JSON.parse(gist.files['receitas.json']?.content || '{}'),
    news:    JSON.parse(gist.files['news.json']?.content    || '{}'),
  };
  return _gistCache;
}

async function _writeGist(tipo, data) {
  if (!getGistToken()) throw new Error('Token não configurado.');
  const filename = tipo === 'receita' ? 'receitas.json' : 'news.json';
  const res = await fetch(GIST_API, {
    method: 'PATCH',
    headers: gistHeaders(true),
    body: JSON.stringify({
      files: { [filename]: { content: JSON.stringify(data, null, 2) } }
    })
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearGistToken();
      throw new Error('Token inválido. Reconfigure pelo botão "⚙".');
    }
    throw new Error(`Gist write error: ${res.status} ${await res.text()}`);
  }
  _gistCache = null;
}

window.DB = {
  // Lista todos os itens de um tipo, ordenados por nome
  async list(tipo) {
    const all = await _readGist();
    const bucket = all[tipo] || {};
    return Object.keys(bucket)
      .sort((a, b) => a.localeCompare(b, 'pt'))
      .map(nome => ({ id: nome, nome })); // id === nome no Gist
  },

  // Busca os dados completos de um item pelo nome (id = nome)
  async get(id) {
    const all = await _readGist();
    // id é o nome no modelo Gist
    for (const tipo of ['receita', 'news']) {
      if (all[tipo]?.[id] !== undefined) {
        return { id, nome: id, dados: all[tipo][id] };
      }
    }
    return null;
  },

  // Salva (upsert) — cria ou sobrescreve pelo nome
  async save(tipo, nome, dados) {
    const all = await _readGist();
    const bucket = all[tipo] || {};
    bucket[nome] = dados;
    await _writeGist(tipo, bucket);
    return nome; // id = nome
  },

  // Remove um item pelo nome
  async remove(id) {
    // Precisamos saber o tipo — tentamos nos dois buckets
    const all = await _readGist();
    let changed = false;
    for (const tipo of ['receita', 'news']) {
      if (all[tipo]?.[id] !== undefined) {
        delete all[tipo][id];
        await _writeGist(tipo, all[tipo]);
        changed = true;
        break;
      }
    }
    if (!changed) throw new Error(`Item "${id}" não encontrado`);
  },

  // Exporta todos os itens de um tipo como arquivo JSON
  async exportAll(tipo, filename) {
    const all = await _readGist();
    const bucket = all[tipo] || {};
    downloadFile(JSON.stringify(bucket, null, 2), filename, 'application/json');
    return Object.keys(bucket).length;
  },

  // Importa itens de um arquivo JSON { nome: dados }
  async importFromFile(tipo, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (typeof imported !== 'object' || Array.isArray(imported)) {
            return reject(new Error('Arquivo inválido'));
          }
          const all = await _readGist();
          const bucket = all[tipo] || {};
          Object.assign(bucket, imported);
          await _writeGist(tipo, bucket);
          resolve(Object.keys(imported).length);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
};

// ============ Setup do token (modal) ============
window.TokenSetup = {
  // Cria o modal e o botão na toolbar (chamar em cada página)
  init() {
    if ($('#token-modal')) return; // já existe
    const modalHtml = `
<div class="modal-backdrop" id="token-modal">
  <div class="modal" style="max-width:520px;">
    <h3>⚙ Configurar acesso</h3>
    <p style="color:#94a3b8; font-size:13px; margin: 0 0 16px;">
      Cole abaixo o <strong style="color:#e2e8f0;">Personal Access Token do GitHub</strong> com permissão <code>gist</code>.
      Esse token fica salvo só no seu navegador, nunca é enviado para o repositório.
    </p>
    <div class="field">
      <label class="field-label">Token (começa com <code>ghp_</code>)</label>
      <input type="password" id="token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">
    </div>
    <div style="font-size:12px; color:#94a3b8; margin-bottom: 12px;">
      Não tem o token? Peça para o administrador da equipe.
      Para criar: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style="color:#60a5fa;">github.com/settings/tokens</a> → Generate new (classic) → marcar apenas <code>gist</code>.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="token-cancel">Cancelar</button>
      <button class="btn btn-primary" id="token-save-btn">Salvar token</button>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Adiciona botão "⚙" na toolbar se existir
    const toolbar = document.querySelector('.toolbar');
    if (toolbar && !$('#btn-token-config')) {
      const btn = document.createElement('button');
      btn.id = 'btn-token-config';
      btn.className = 'btn btn-ghost';
      btn.title = 'Configurar token de acesso';
      btn.textContent = '⚙';
      btn.style.fontSize = '16px';
      btn.style.minWidth = '36px';
      btn.addEventListener('click', () => this.open());
      toolbar.appendChild(btn);
    }

    // Eventos do modal
    $('#token-cancel').addEventListener('click', () => this.close());
    $('#token-modal').addEventListener('click', (e) => { if (e.target === $('#token-modal')) this.close(); });
    $('#token-save-btn').addEventListener('click', () => this.save());
    $('#token-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.save(); }
      if (e.key === 'Escape') this.close();
    });

    // Se não tem token, abre o modal automaticamente
    if (!getGistToken()) {
      setTimeout(() => this.open(), 400);
    }
  },

  open() {
    $('#token-input').value = getGistToken();
    $('#token-modal').classList.add('open');
    setTimeout(() => $('#token-input').focus(), 50);
  },

  close() { $('#token-modal').classList.remove('open'); },

  save() {
    const v = $('#token-input').value.trim();
    if (!v) { $('#token-input').focus(); return; }
    if (!/^gh[ps]_[A-Za-z0-9]{30,}$/.test(v)) {
      if (!confirm('O token não parece ter o formato padrão (ghp_...). Salvar mesmo assim?')) return;
    }
    setGistToken(v);
    _gistCache = null;
    this.close();
    showToast('Token salvo! Recarregando...');
    setTimeout(() => location.reload(), 800);
  }
};


// ============ Toolbar de salvar/carregar ============
// opts = { tipo, getDataFn, loadDataFn, newDataFn, fileNamePrefix }
window.initSaveToolbar = function(opts) {
  const { tipo, getDataFn, loadDataFn, newDataFn, fileNamePrefix } = opts;
  let currentId = null; // id do item carregado no momento

  // Inicializa o modal de configuração de token
  TokenSetup.init();

  // Mostra/esconde loading na toolbar
  function setLoading(on) {
    const bar = document.querySelector('.toolbar');
    if (bar) bar.style.opacity = on ? '0.6' : '1';
    const btns = document.querySelectorAll('.toolbar button');
    btns.forEach(b => b.disabled = on);
  }

  // Atualiza o dropdown com a lista do Gist
  async function refreshSelect() {
    const sel = $('#load-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Carregando... —</option>';
    try {
      const items = await DB.list(tipo);
      sel.innerHTML = '<option value="">— Carregar salvo —</option>' +
        items.map(i => `<option value="${escapeAttr(i.id)}" data-nome="${escapeAttr(i.nome)}">${escapeHtml(i.nome)}</option>`).join('');
    } catch (err) {
      sel.innerHTML = '<option value="">— Erro ao carregar —</option>';
      showToast('Erro ao conectar: ' + (err?.message || err), 4000);
      console.error('[DUX] Erro ao listar do Gist:', err);
    }
  }

  // Inicializar
  refreshSelect();

  // Nova
  $('#btn-new')?.addEventListener('click', () => {
    if (!confirm('Limpar a tela e começar uma nova?')) return;
    currentId = null;
    newDataFn();
    $('#save-name').value = '';
    if ($('#load-select')) $('#load-select').value = '';
    showToast('Pronto para um novo');
  });

  // Carregar (ao selecionar no dropdown)
  $('#load-select')?.addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) return;
    const opt = e.target.selectedOptions[0];
    const nome = opt?.dataset?.nome || '';
    setLoading(true);
    try {
      const row = await DB.get(id);
      if (!row) { showToast('Não encontrado'); return; }
      loadDataFn(row.dados);
      currentId = row.id;
      $('#save-name').value = row.nome;
      showToast(`Carregado: ${row.nome}`);
    } catch (err) {
      showToast('Erro ao carregar', 3000);
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  // Salvar
  $('#btn-save')?.addEventListener('click', async () => {
    const nome = $('#save-name').value.trim();
    if (!nome) { $('#save-name').focus(); showToast('Dê um nome antes de salvar'); return; }
    setLoading(true);
    try {
      const dados = getDataFn();
      const id = await DB.save(tipo, nome, dados);
      currentId = id;
      await refreshSelect();
      if ($('#load-select')) $('#load-select').value = id;
      showToast(`Salvo: ${nome}`);
    } catch (err) {
      showToast('Erro ao salvar: ' + (err?.message || err), 4000);
      console.error('[DUX] Erro ao salvar no Gist:', err);
    } finally {
      setLoading(false);
    }
  });

  // Excluir
  $('#btn-delete')?.addEventListener('click', async () => {
    const nome = $('#save-name').value.trim();
    if (!currentId) { showToast('Nenhum item carregado'); return; }
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    try {
      await DB.remove(currentId);
      currentId = null;
      await refreshSelect();
      $('#save-name').value = '';
      showToast(`Excluído: ${nome}`);
    } catch (err) {
      showToast('Erro ao excluir', 3000);
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  // Exportar
  $('#btn-export')?.addEventListener('click', async () => {
    setLoading(true);
    try {
      const date = new Date().toISOString().slice(0,10);
      const count = await DB.exportAll(tipo, `${fileNamePrefix}-${date}.json`);
      if (count === 0) { showToast('Nada salvo para exportar'); return; }
      showToast(`${count} item(s) exportado(s)`);
    } catch (err) {
      showToast('Erro ao exportar', 3000);
    } finally {
      setLoading(false);
    }
  });

  // Importar
  $('#btn-import')?.addEventListener('click', () => $('#file-import').click());
  $('#file-import')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const count = await DB.importFromFile(tipo, file);
      await refreshSelect();
      showToast(`${count} item(s) importado(s)`);
    } catch (err) {
      showToast('Erro: arquivo inválido', 3000);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  });
};

// ============ Editor rich-text (compartilhado) ============
window.RichEditor = {
  init(editorEl, onChange) {
    editorEl.addEventListener('input', () => {
      if (editorEl.innerHTML.trim() === '' || editorEl.innerHTML === '<br>') editorEl.innerHTML = '';
      onChange?.();
    });
    editorEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  },
  applyCmd(cmd, editorEl, onChange) {
    document.execCommand(cmd, false, null);
    editorEl.focus();
    onChange?.();
  },
  updateToolbarState(toolbarButtons) {
    toolbarButtons.forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch (e) {}
    });
  }
};

// ============ Link modal (compartilhado) ============
window.LinkModal = {
  savedRange: null, currentEditor: null, onAfterApply: null,
  saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) this.savedRange = sel.getRangeAt(0).cloneRange();
  },
  restoreSelection() {
    if (this.savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(this.savedRange); }
  },
  getCurrentLink() {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== this.currentEditor) {
      if (node.nodeType === 1 && node.tagName === 'A') return node;
      node = node.parentNode;
    }
    return null;
  },
  open(editor, onAfterApply) {
    this.currentEditor = editor; this.onAfterApply = onAfterApply;
    this.saveSelection();
    const sel = window.getSelection();
    const existing = this.getCurrentLink();
    if (existing) {
      $('#link-modal-title').textContent = 'Editar link';
      $('#link-text').value = existing.textContent;
      $('#link-url').value = existing.getAttribute('href') || '';
    } else {
      $('#link-modal-title').textContent = 'Inserir link';
      $('#link-text').value = sel.toString();
      $('#link-url').value = '';
    }
    $('#link-modal').classList.add('open');
    setTimeout(() => { ($('#link-text').value ? $('#link-url') : $('#link-text')).focus(); }, 50);
  },
  close() { $('#link-modal').classList.remove('open'); },
  apply() {
    let url = $('#link-url').value.trim();
    const text = $('#link-text').value.trim();
    if (!url) { $('#link-url').focus(); return; }
    if (!/^(https?:|mailto:|tel:|#|\/)/i.test(url)) url = 'https://' + url;
    this.restoreSelection();
    const existing = this.getCurrentLink();
    if (existing) {
      existing.setAttribute('href', url); existing.setAttribute('target', '_blank'); existing.setAttribute('rel', 'noopener');
      if (text) existing.textContent = text;
    } else {
      document.execCommand('insertHTML', false, `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(text || url)}</a>`);
    }
    this.close(); this.currentEditor?.focus(); this.onAfterApply?.();
  },
  unlink(editor, onAfter) { document.execCommand('unlink', false, null); editor.focus(); onAfter?.(); },
  initModal() {
    $('#link-cancel')?.addEventListener('click', () => this.close());
    $('#link-modal')?.addEventListener('click', (e) => { if (e.target === $('#link-modal')) this.close(); });
    $('#link-save')?.addEventListener('click', () => this.apply());
    ['#link-text', '#link-url'].forEach(s => {
      $(s)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.apply(); }
        if (e.key === 'Escape') this.close();
      });
    });
  }
};

// ============ Serializar editor -> HTML inline ============
window.serializeEditorToInline = function(editor, fontStack, options) {
  options = options || {};
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    const allowed = (tag === 'a') ? ['href'] : [];
    [...el.attributes].forEach(attr => { if (!allowed.includes(attr.name)) el.removeAttribute(attr.name); });
    if (tag === 'b') { const s = document.createElement('strong'); s.innerHTML = el.innerHTML; el.replaceWith(s); }
    if (tag === 'i') { const s = document.createElement('em'); s.innerHTML = el.innerHTML; el.replaceWith(s); }
  });

  let html = clone.innerHTML.trim();
  if (!html) return '';
  if (!/^<(p|ul|ol|h\d)/.test(html)) html = '<p>' + html + '</p>';

  const pStyle = `font-family:${fontStack};font-size:18px;font-weight:400;line-height:1.5;margin:0 0 14px 0;color:#1a1a1a;`;
  const ulStyle = `font-family:${fontStack};font-size:18px;font-weight:400;line-height:1.5;margin:0 0 14px 0;padding:0;list-style:none;color:#1a1a1a;`;
  const liStyle = `position:relative;padding-left:20px;margin-bottom:6px;`;
  const strongStyle = options.boldUnderline ? 'font-weight:700;text-decoration:underline;text-underline-offset:3px;' : 'font-weight:700;';
  const emStyle = 'font-style:italic;';
  const aStyle = 'color:#1a1a1a;text-decoration:underline;text-underline-offset:3px;';

  html = html.replace(/<p>/g, `<p style="${pStyle}">`);
  html = html.replace(/<ul>/g, `<ul style="${ulStyle}">`);
  html = html.replace(/<li>/g, `<li style="${liStyle}"><span style="position:absolute;left:4px;top:9px;width:7px;height:7px;background-color:#1a1a1a;border-radius:50%;"></span>`);
  html = html.replace(/<strong>/g, `<strong style="${strongStyle}">`);
  html = html.replace(/<em>/g, `<em style="${emStyle}">`);
  html = html.replace(/<a\s+href="([^"]*)"[^>]*>/g, (m, href) => `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" style="${aStyle}">`);
  html = html.replace(/(margin:0 0 14px 0;)([^>]*>)(?=(?:(?!<(p|ul|ol|h\d)\b).)*$)/s, 'margin:0;$2');

  return html;
};
