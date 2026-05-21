# Ferramentas DUX

Plataforma com 2 geradores de HTML para o site DUX Human Health:

- **Receitas** (`receitas.html`) — cards de receita com ingredientes, modo de preparo, dificuldade, tempo e rendimento
- **News** (`news.html`) — blocos de conteúdo distribuídos em 2 colunas, com formatação rica

## Estrutura

```
dux-ferramentas/
├── index.html      ← Hub (página inicial)
├── receitas.html   ← Gerador de receitas
├── news.html       ← Gerador de news
├── style.css       ← Estilos compartilhados
└── shared.js       ← Lógica compartilhada (salvamento, editor, etc)
```

## Como usar

1. Abra `index.html` no navegador
2. Escolha a ferramenta
3. Preencha o conteúdo
4. Clique em **Copiar HTML** e cole na sua plataforma de site

## Salvar / Carregar

Cada ferramenta tem barra de salvamento no topo:

- **Nome**: dê um nome (ex: "Pudim de Chia", "News Dezembro 2025")
- **Salvar**: guarda no navegador
- **Carregar salvo**: dropdown com tudo que você salvou
- **Excluir**: remove o item selecionado
- **Nova**: limpa a tela
- **Exportar**: baixa um `.json` com tudo que está salvo
- **Importar**: carrega um `.json` exportado

⚠️ **Importante**: os dados ficam salvos no navegador de quem usa. Não são sincronizados entre computadores. Use Exportar/Importar para fazer backup ou compartilhar com outras pessoas.

## Compatibilidade do HTML gerado

- CSS 100% inline (atributo `style="..."` em cada elemento)
- Fonte Barlow via Google Fonts (carregada com `<link>` no topo do bloco)
- Layout em `<table>` quando necessário
- Funciona em VTEX, Shopify, WordPress, Wix, e-mail marketing etc.

## Hospedando no GitHub Pages

1. Crie um repositório público (ex: `dux-ferramentas`)
2. Faça upload dos 5 arquivos (`index.html`, `receitas.html`, `news.html`, `style.css`, `shared.js`)
3. Settings → Pages → Source: Deploy from a branch → main → `/ (root)` → Save
4. Em 1-2 minutos a URL fica: `https://SEU-USUARIO.github.io/dux-ferramentas/`
