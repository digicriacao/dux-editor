/* ============ DUX Ferramentas - JavaScript compartilhado ============ */

// ===== Supabase config =====
const SUPABASE_URL = 'https://waihlslucgqmjfqwwbbu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhaWhsc2x1Y2dxbWpmcXd3YmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTg2NDksImV4cCI6MjA5NTYzNDY0OX0.W5NdhtO7U1XP2teiyekgPyOYS77O7yRdLNJGi6p20Lg';
const API = `${SUPABASE_URL}/rest/v1/dux_itens`;
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

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

// ============ Supabase Storage ============
window.DB = {
  // Busca todos os itens de um tipo ('receita' ou 'news'), ordenados por nome
  async list(tipo) {
    const res = await fetch(`${API}?tipo=eq.${tipo}&select=id,nome,atualizado&order=nome.asc`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    return await res.json(); // [{id, nome, atualizado}, ...]
  },

  // Busca os dados completos de um item pelo id
  async get(id) {
    const res = await fetch(`${API}?id=eq.${id}&select=*`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return rows[0] || null;
  },

  // Salva (upsert): se já existe um item com esse tipo+nome, atualiza. Senão, cria.
  async save(tipo, nome, dados) {
    // Verificar se já existe
    const res = await fetch(`${API}?tipo=eq.${tipo}&nome=eq.${encodeURIComponent(nome)}&select=id`, { headers: HEADERS });
    const existing = await res.json();

    if (existing.length > 0) {
      // Atualizar
      const upd = await fetch(`${API}?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { ...HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify({ dados, atualizado: new Date().toISOString() })
      });
      if (!upd.ok) throw new Error(await upd.text());
      return existing[0].id;
    } else {
      // Criar
      const ins = await fetch(API, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify({ tipo, nome, dados, atualizado: new Date().toISOString() })
      });
      if (!ins.ok) throw new Error(await ins.text());
      const rows = await ins.json();
      return rows[0].id;
    }
  },

  // Remove um item pelo id
  async remove(id) {
    const res = await fetch(`${API}?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
  },

  // Exporta todos os itens de um tipo como JSON
  async exportAll(tipo, filename) {
    const res = await fetch(`${API}?tipo=eq.${tipo}&select=*&order=nome.asc`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const obj = {};
    rows.forEach(r => { obj[r.nome] = r.dados; });
    downloadFile(JSON.stringify(obj, null, 2), filename, 'application/json');
    return rows.length;
  },

  // Importa itens de um arquivo JSON (objeto {nome: dados})
  async importFromFile(tipo, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (typeof imported !== 'object' || Array.isArray(imported)) return reject(new Error('Arquivo inválido'));
          const names = Object.keys(imported);
          for (const nome of names) {
            await DB.save(tipo, nome, imported[nome]);
          }
          resolve(names.length);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
};

// ============ Toolbar de salvar/carregar ============
// opts = { tipo, getDataFn, loadDataFn, newDataFn, fileNamePrefix }
window.initSaveToolbar = function(opts) {
  const { tipo, getDataFn, loadDataFn, newDataFn, fileNamePrefix } = opts;
  let currentId = null; // id do item carregado no momento

  // Mostra/esconde loading na toolbar
  function setLoading(on) {
    const bar = document.querySelector('.toolbar');
    if (bar) bar.style.opacity = on ? '0.6' : '1';
    const btns = document.querySelectorAll('.toolbar button');
    btns.forEach(b => b.disabled = on);
  }

  // Atualiza o dropdown com a lista do Supabase
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
      showToast('Erro ao conectar com o banco', 3000);
      console.error(err);
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
      showToast('Erro ao salvar', 3000);
      console.error(err);
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
