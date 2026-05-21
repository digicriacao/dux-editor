/* ============ DUX Ferramentas - JavaScript compartilhado ============ */

// ===== Utils =====
window.$ = (s, ctx) => (ctx || document).querySelector(s);
window.$$ = (s, ctx) => (ctx || document).querySelectorAll(s);

window.escapeHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
window.escapeAttr = (s) => String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

window.showToast = function(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
};

window.copyText = async function(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
};

window.downloadFile = function(content, filename, mime) {
  const blob = new Blob([content], { type: mime || 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ============ Sistema de salvamento ============
// Cada ferramenta tem sua "chave" no localStorage. Os dados são objetos serializáveis.
// Estrutura: { [nome_da_receita]: { ...dados }, ... }

window.Storage = {
  load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
      return {};
    }
  },
  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },
  listNames(key) {
    return Object.keys(this.load(key)).sort();
  },
  get(key, name) {
    const all = this.load(key);
    return all[name] || null;
  },
  set(key, name, data) {
    const all = this.load(key);
    all[name] = { ...data, _savedAt: new Date().toISOString() };
    this.save(key, all);
  },
  remove(key, name) {
    const all = this.load(key);
    delete all[name];
    this.save(key, all);
  },
  exportAll(key, filename) {
    const data = this.load(key);
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, filename, 'application/json');
  },
  importFromFile(key, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (typeof imported !== 'object' || Array.isArray(imported)) {
            return reject(new Error('Arquivo inválido'));
          }
          const existing = Storage.load(key);
          const merged = { ...existing, ...imported };
          Storage.save(key, merged);
          resolve(Object.keys(imported).length);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
};

// ============ Inicializa toolbar de salvar/carregar/exportar ============
// Espera ter no DOM: input#save-name, select#load-select, botões #btn-new, #btn-save, #btn-delete, #btn-export, #btn-import, input#file-import
window.initSaveToolbar = function(opts) {
  // opts = { key, getDataFn, loadDataFn, newDataFn, fileNamePrefix }
  const { key, getDataFn, loadDataFn, newDataFn, fileNamePrefix } = opts;

  function refreshLoadSelect() {
    const sel = $('#load-select');
    if (!sel) return;
    const names = Storage.listNames(key);
    sel.innerHTML = '<option value="">— Carregar salvo —</option>' +
      names.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
  }

  refreshLoadSelect();

  // Novo
  $('#btn-new')?.addEventListener('click', () => {
    if (!confirm('Limpar a tela e começar uma nova?')) return;
    newDataFn();
    $('#save-name').value = '';
    $('#load-select').value = '';
    showToast('Pronto para uma nova');
  });

  // Carregar
  $('#load-select')?.addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return;
    const data = Storage.get(key, name);
    if (!data) { showToast('Não encontrado'); return; }
    loadDataFn(data);
    $('#save-name').value = name;
    showToast(`Carregado: ${name}`);
  });

  // Salvar
  $('#btn-save')?.addEventListener('click', () => {
    const name = $('#save-name').value.trim();
    if (!name) { $('#save-name').focus(); showToast('Dê um nome antes de salvar'); return; }
    const data = getDataFn();
    Storage.set(key, name, data);
    refreshLoadSelect();
    $('#load-select').value = name;
    showToast(`Salvo: ${name}`);
  });

  // Excluir
  $('#btn-delete')?.addEventListener('click', () => {
    const name = $('#save-name').value.trim();
    if (!name) { showToast('Nenhum nome selecionado'); return; }
    if (!Storage.get(key, name)) { showToast('Esse nome não existe'); return; }
    if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
    Storage.remove(key, name);
    refreshLoadSelect();
    $('#save-name').value = '';
    $('#load-select').value = '';
    showToast(`Excluído: ${name}`);
  });

  // Exportar
  $('#btn-export')?.addEventListener('click', () => {
    const count = Storage.listNames(key).length;
    if (count === 0) { showToast('Nada salvo para exportar'); return; }
    const date = new Date().toISOString().slice(0,10);
    Storage.exportAll(key, `${fileNamePrefix}-${date}.json`);
    showToast(`${count} item(s) exportado(s)`);
  });

  // Importar
  $('#btn-import')?.addEventListener('click', () => $('#file-import').click());
  $('#file-import')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const count = await Storage.importFromFile(key, file);
      refreshLoadSelect();
      showToast(`${count} item(s) importado(s)`);
    } catch (err) {
      showToast('Erro: arquivo inválido');
    }
    e.target.value = '';
  });
};

// ============ Helpers de editor rich-text (compartilhados) ============
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
  applyList(editorEl, onChange) {
    document.execCommand('insertUnorderedList', false, null);
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
  savedRange: null,
  currentEditor: null,
  onAfterApply: null,

  saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) this.savedRange = sel.getRangeAt(0).cloneRange();
  },
  restoreSelection() {
    if (this.savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this.savedRange);
    }
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
    this.currentEditor = editor;
    this.onAfterApply = onAfterApply;
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
      existing.setAttribute('href', url);
      existing.setAttribute('target', '_blank');
      existing.setAttribute('rel', 'noopener');
      if (text) existing.textContent = text;
    } else {
      const linkHtml = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(text || url)}</a>`;
      document.execCommand('insertHTML', false, linkHtml);
    }
    this.close();
    this.currentEditor?.focus();
    this.onAfterApply?.();
  },
  unlink(editor, onAfter) {
    document.execCommand('unlink', false, null);
    editor.focus();
    onAfter?.();
  },
  initModal() {
    // Conectar botões do modal (presumindo que o HTML existe)
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

// ============ Serializar editor -> HTML inline (compartilhado) ============
// Aceita opções: { boldUnderline: true } para o estilo receita
window.serializeEditorToInline = function(editor, fontStack, options) {
  options = options || {};
  const clone = editor.cloneNode(true);

  // Limpa atributos
  clone.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    const allowed = (tag === 'a') ? ['href'] : [];
    [...el.attributes].forEach(attr => { if (!allowed.includes(attr.name)) el.removeAttribute(attr.name); });
    if (tag === 'b') { const s = document.createElement('strong'); s.innerHTML = el.innerHTML; el.replaceWith(s); }
    if (tag === 'i') { const s = document.createElement('em'); s.innerHTML = el.innerHTML; el.replaceWith(s); }
  });

  let html = clone.innerHTML.trim();
  if (!html) return '';

  // Se não estiver envelopado em block, envelopa em <p>
  if (!/^<(p|ul|ol|h\d)/.test(html)) html = '<p>' + html + '</p>';

  // Aplica estilos inline
  const pStyle = `font-family:${fontStack};font-size:18px;font-weight:400;line-height:1.5;margin:0 0 14px 0;color:#1a1a1a;`;
  const ulStyle = `font-family:${fontStack};font-size:18px;font-weight:400;line-height:1.5;margin:0 0 14px 0;padding:0;list-style:none;color:#1a1a1a;`;
  const liStyle = `position:relative;padding-left:20px;margin-bottom:6px;`;
  const strongStyle = options.boldUnderline
    ? 'font-weight:700;text-decoration:underline;text-underline-offset:3px;'
    : 'font-weight:700;';
  const emStyle = 'font-style:italic;';
  const aStyle = 'color:#0066ff;text-decoration:underline;text-underline-offset:3px;';

  html = html.replace(/<p>/g, `<p style="${pStyle}">`);
  html = html.replace(/<ul>/g, `<ul style="${ulStyle}">`);
  html = html.replace(/<li>/g, `<li style="${liStyle}"><span style="position:absolute;left:4px;top:9px;width:7px;height:7px;background-color:#0066ff;border-radius:50%;"></span>`);
  html = html.replace(/<\/li>/g, '</li>');
  html = html.replace(/<strong>/g, `<strong style="${strongStyle}">`);
  html = html.replace(/<em>/g, `<em style="${emStyle}">`);
  html = html.replace(/<a\s+href="([^"]*)"[^>]*>/g, (m, href) => {
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" style="${aStyle}">`;
  });

  // Remove margin-bottom do último bloco
  html = html.replace(/(margin:0 0 14px 0;)([^>]*>)(?=(?:(?!<(p|ul|ol|h\d)\b).)*$)/s, 'margin:0;$2');

  return html;
};
