// Loja da Nelsi: catálogo (Tupperware, perfumes e kits de beleza) com pedido pelo WhatsApp.
//
// /                     página inicial: destaques, promoções, catálogo com filtros e "como comprar"
// /produto/<slug>/      página de um produto
// /pedir/<slug>         conta o pedido e abre o WhatsApp da Nelsi com a mensagem pronta
// POST /api/sacola      { itens: [{ slug, qtd }] } conta os pedidos e devolve o link do WhatsApp com a lista
// /imagens/<id>         fotos enviadas pelo painel
// /privacidade/         política de privacidade
// /sitemap.xml          páginas para o Google
// Tudo o que muda (produtos, preços, WhatsApp, textos) é editado no painel e fica no banco D1.
import { garantirTabelas } from "./contas.js";
import { TEMAS, coresDoTema, hexOk } from "../public/admin/cores.js";

export { TEMAS };

const TABELAS = [
    `CREATE TABLE IF NOT EXISTS ajustes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        categoria TEXT NOT NULL DEFAULT '',
        marca TEXT NOT NULL DEFAULT '',
        descricao TEXT NOT NULL DEFAULT '',
        preco INTEGER NOT NULL DEFAULT 0,
        preco_antigo INTEGER NOT NULL DEFAULT 0,
        foto TEXT NOT NULL DEFAULT '',
        destaque INTEGER NOT NULL DEFAULT 0,
        esgotado INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // Pedidos pelo WhatsApp: total por produto por dia (sem guardar quem pediu)
    `CREATE TABLE IF NOT EXISTS pedidos (
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        dia TEXT NOT NULL,
        n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (produto_id, dia)
    )`,
    // Quem já pediu cada produto hoje (código embaralhado, apagado no dia seguinte): 1 por pessoa por produto por dia
    `CREATE TABLE IF NOT EXISTS pedidos_vistos (
        dia TEXT NOT NULL,
        codigo TEXT NOT NULL,
        PRIMARY KEY (dia, codigo)
    )`,
    `CREATE TABLE IF NOT EXISTS imagens (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        dados BLOB NOT NULL,
        tamanho INTEGER NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const AJUSTES_PADRAO = {
    nome: "Nelsi",
    slogan: "Perfumes, beleza e Tupperware",
    apresentacao: "Oi, eu sou a Nelsi! Aqui você encontra perfumes, maquiagem, kits de beleza e Tupperware para você ou para presentear. Escolha o que gostou e me chame no WhatsApp que eu te atendo pessoalmente.",
    whatsapp: "",
    cidade: "Curitiba",
    entrega: "Atendo Curitiba e região. Combine o dia e o local comigo pelo WhatsApp.",
    pagamento: "Pix, dinheiro ou cartão.",
    instagram: "",
    facebook: "",
    email: "",
    foto: "",
    moeda: "BRL",
    categorias: "Perfumes\nMaquiagem\nKits presente\nTupperware",
    marcas: "O Boticário\nNatura\nEudora\nTupperware",
};

let prontas = false;
export async function garantirTabelasLoja(db) {
    if (prontas) return;
    await garantirTabelas(db);
    await db.batch(TABELAS.map((sql) => db.prepare(sql)));
    // Bancos criados antes do campo "marca"
    const { results: colunas } = await db.prepare("PRAGMA table_info(produtos)").all();
    if (!colunas.some((c) => c.name === "marca")) await db.prepare("ALTER TABLE produtos ADD COLUMN marca TEXT NOT NULL DEFAULT ''").run();
    const iniciado = await db.prepare("SELECT 1 FROM ajustes WHERE chave = 'iniciado'").first();
    if (!iniciado) {
        await db.batch([
            ...Object.entries(AJUSTES_PADRAO).map(([k, v]) => db.prepare("INSERT OR IGNORE INTO ajustes (chave, valor) VALUES (?, ?)").bind(k, v)),
            db.prepare("INSERT OR IGNORE INTO ajustes (chave, valor) VALUES ('iniciado', datetime('now'))"),
        ]);
    }
    prontas = true;
}

// Aparência (tela "Aparência" do painel). Fica separada dos dados da loja e pode voltar ao original.
export const APARENCIA_PADRAO = {
    tema: "vinho",
    cor_propria: "",
    fonte: "elegante",
    logo: "",
    banner_texto: "",
    banner_ate: "",
    mostrar_destaques: "1",
    mostrar_categorias: "1",
    mostrar_sobre: "1",
    mostrar_como_comprar: "1",
    mostrar_pagamento: "1",
    foto_topo: "redonda",
    foto_produto: "quadrada",
    colunas_celular: "2",
    texto_pedir: "Pedir",
    texto_ver_catalogo: "Ver o catálogo",
    texto_topo: "Escolha aqui e peça direto comigo no WhatsApp.",
    texto_falar: "Falar comigo",
    texto_enviar_sacola: "Enviar pedido no WhatsApp",
    titulo_categorias: "Compre por categoria",
    titulo_destaques: "Destaques e promoções",
    titulo_catalogo: "Catálogo",
    titulo_sobre: "Sobre mim",
    titulo_como_comprar: "Como comprar",
    ordem_secoes: "categorias,destaques,catalogo,sobre,como_comprar",
};
export const SECOES_INICIO = { categorias: "Compre por categoria", destaques: "Destaques e promoções", catalogo: "Catálogo", sobre: "Sobre mim", como_comprar: "Como comprar" };
export const TEXTOS = {
    texto_pedir: { rotulo: "Botão de pedir (em cada produto)", max: 20 },
    texto_topo: { rotulo: "Frase do topo", max: 120 },
    texto_ver_catalogo: { rotulo: "Botão do topo para o catálogo", max: 30 },
    texto_falar: { rotulo: "Botão do topo para o WhatsApp", max: 30 },
    texto_enviar_sacola: { rotulo: "Botão de enviar a sacola", max: 40 },
    titulo_categorias: { rotulo: "Título das categorias", max: 40 },
    titulo_destaques: { rotulo: "Título dos destaques", max: 40 },
    titulo_catalogo: { rotulo: "Título do catálogo", max: 40 },
    titulo_sobre: { rotulo: "Título do \"Sobre mim\"", max: 40 },
    titulo_como_comprar: { rotulo: "Título do \"Como comprar\"", max: 40 },
};
export function ordemDasSecoes(a) {
    const lista = [...new Set(String(a.ordem_secoes || "").split(",").filter((k) => k in SECOES_INICIO))];
    // Seção nova que ainda não está na ordem salva entra na posição do padrão
    APARENCIA_PADRAO.ordem_secoes.split(",").forEach((k, i) => { if (!lista.includes(k)) lista.splice(Math.min(i, lista.length), 0, k); });
    return lista;
}
// A última palavra do título fica em destaque (itálico, na cor do tema)
function tituloSecao(t) {
    const palavras = String(t).trim().split(/\s+/);
    if (palavras.length < 2) return esc(t);
    const ultima = palavras.pop();
    return `${esc(palavras.join(" "))} <em>${esc(ultima)}</em>`;
}
export const OPCOES_APARENCIA = {
    foto_topo: { redonda: "Redonda", quadrada: "Quadrada", sem: "Sem foto" },
    foto_produto: { quadrada: "Quadrada", vertical: "Vertical (boa para perfume)", redonda: "Cantos bem arredondados" },
    colunas_celular: { "1": "1 por linha, maior", "2": "2 por linha", "3": "3 por linha, menores", "4": "4 por linha, bem pequenos" },
};
export const FONTES = {
    elegante: { nome: "Elegante", url: "family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Nunito+Sans:wght@400;600;700;800" },
    moderna: { nome: "Moderna", url: "family=Poppins:wght@500;600;700&family=Nunito+Sans:wght@400;600;700;800" },
    delicada: { nome: "Delicada", url: "family=Dancing+Script:wght@600;700&family=Nunito+Sans:wght@400;600;700;800" },
    classica: { nome: "Clássica", url: "family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Nunito+Sans:wght@400;600;700;800" },
    arredondada: { nome: "Arredondada", url: "family=Quicksand:wght@600;700&family=Nunito+Sans:wght@400;600;700;800" },
    marcante: { nome: "Marcante", url: "family=Abril+Fatface&family=Nunito+Sans:wght@400;600;700;800" },
};

export async function lerAjustes(db) {
    const { results } = await db.prepare("SELECT chave, valor FROM ajustes").all();
    const a = { ...AJUSTES_PADRAO, ...APARENCIA_PADRAO, ...Object.fromEntries(results.map((r) => [r.chave, r.valor])) };
    if (!TEMAS[a.tema] && !(a.tema === "propria" && hexOk(a.cor_propria))) a.tema = APARENCIA_PADRAO.tema;
    if (!FONTES[a.fonte]) a.fonte = APARENCIA_PADRAO.fonte;
    // Textos antigos do padrão (antes do visual "Vitrine") viram os novos
    if (a.slogan === "Tupperware, perfumes e kits de beleza") a.slogan = AJUSTES_PADRAO.slogan;
    if (a.categorias === "Tupperware\nPerfumes\nKits de beleza") a.categorias = AJUSTES_PADRAO.categorias;
    for (const [k, opcoes] of Object.entries(OPCOES_APARENCIA)) if (!(a[k] in opcoes)) a[k] = APARENCIA_PADRAO[k];
    for (const k of Object.keys(TEXTOS)) if (!String(a[k] || "").trim()) a[k] = APARENCIA_PADRAO[k];
    return a;
}

export const categoriasDe = (a) => String(a.categorias || "").split("\n").map((c) => c.trim()).filter(Boolean);
export const marcasDe = (a) => String(a.marcas || "").split("\n").map((c) => c.trim()).filter(Boolean);
const rotuloProduto = (p) => [p.marca, p.categoria].filter(Boolean).join(" · ");
// Lista escrita "A, B, C e D"
const listaTexto = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} e ${l.at(-1)}` : l[0] || "");

export function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function dinheiro(centavos, moeda = "BRL") {
    return new Intl.NumberFormat(moeda === "EUR" ? "pt-PT" : "pt-BR", { style: "currency", currency: moeda === "EUR" ? "EUR" : "BRL" }).format((centavos || 0) / 100);
}

const numeroZap = (a) => String(a.whatsapp || "").replace(/\D/g, "");
const linkZap = (a, texto) => `https://wa.me/${numeroZap(a)}?text=${encodeURIComponent(texto)}`;
const primeiroNome = (a) => String(a.nome || "Nelsi").trim().split(/\s+/)[0];

// ---------- Ícones ----------

const ICONES = {
    // Logo do WhatsApp (o símbolo oficial do app, usado só para levar à conversa no WhatsApp)
    whatsapp: '<svg class="icone-zap" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.37l-.36-.22-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="cheio" cx="17.5" cy="6.5" r="1"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H9.2v3h2.5V21"/></svg>',
    sacola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>',
    mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    // Desenhos para produto sem foto, por categoria
    pote: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="16" width="30" height="22" rx="5"/><path d="M7 16h34v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2z"/><path d="M15 24h18"/></svg>',
    perfume: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="18" width="24" height="22" rx="6"/><path d="M19 18v-5h10v5M21 13V8h6v5"/><path d="M18 30c4-3 8 3 12 0"/></svg>',
    batom: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="17" y="24" width="14" height="16" rx="2"/><path d="M19 24v-8l10-6v14"/></svg>',
    beleza: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="22" width="12" height="18" rx="3"/><path d="M13 22v-7l6-3v10"/><rect x="26" y="16" width="12" height="24" rx="6"/><path d="M29 22h6"/></svg>',
    presente: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="20" width="30" height="20" rx="3"/><path d="M7 14h34v6H7zM24 14v26"/><path d="M24 14c-3-6-11-6-9-1 1 2 6 1 9 1zM24 14c3-6 11-6 9-1-1 2-6 1-9 1z"/></svg>',
};

function desenhoDa(categoria) {
    const c = String(categoria || "").toLowerCase();
    if (/tupper|pote|cozinha/.test(c)) return ICONES.pote;
    if (/perfum|col[oô]nia|fragr/.test(c)) return ICONES.perfume;
    if (/maqui|batom|make/.test(c)) return ICONES.batom;
    if (/kit|presente/.test(c)) return ICONES.presente;
    if (/beleza|skin|cuidado|creme/.test(c)) return ICONES.beleza;
    return ICONES.presente;
}

// ---------- Moldura das páginas ----------

export function pagina(request, ajustes, { titulo, descricao, conteudo, status = 200, indexar = true, inicio = false, extraHead = "", imagem: imagemPagina = "", tipo = "website" }) {
    const url = new URL(request.url);
    const nome = ajustes.nome || "Nelsi";
    const tituloCompleto = inicio ? `${nome} | ${ajustes.slogan}` : `${titulo} | ${nome}`;
    const foto = imagemPagina || ajustes.foto;
    const imagem = foto ? new URL(foto, url.origin).toString() : "";
    const zap = numeroZap(ajustes);
    const cores = coresDoTema(ajustes.tema, ajustes.cor_propria);
    const hoje = new Date().toISOString().slice(0, 10);
    const banner = ajustes.banner_texto && (!ajustes.banner_ate || ajustes.banner_ate >= hoje)
        ? `\n    <p class="banner">${esc(ajustes.banner_texto)}</p>` : "";
    const redes = [["instagram", "Instagram", ajustes.instagram], ["facebook", "Facebook", ajustes.facebook]]
        .filter(([, , l]) => /^https:\/\//.test(l || ""))
        .map(([k, rotulo, l]) => `<a class="rede" href="${esc(l)}" target="_blank" rel="noopener" aria-label="${rotulo}" title="${rotulo}">${ICONES[k]}</a>`).join("");
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="${cores["--vinho"]}">
    <title>${esc(tituloCompleto)}</title>
    <meta name="description" content="${esc(descricao)}">${indexar ? "" : '\n    <meta name="robots" content="noindex">'}
    <link rel="canonical" href="${url.origin}${url.pathname}">
    <meta property="og:type" content="${tipo}">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:site_name" content="${esc(nome)}">
    <meta property="og:title" content="${esc(tituloCompleto)}">
    <meta property="og:description" content="${esc(descricao)}">${imagem ? `\n    <meta property="og:image" content="${esc(imagem)}">` : ""}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?${FONTES[ajustes.fonte].url}&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <style>body { ${Object.entries(cores).map(([k, v]) => `${k}: ${v};`).join(" ")} }</style>
    <script src="/loja.js" defer></script>${extraHead}
</head>
<body data-tema="${ajustes.tema}" data-fonte="${ajustes.fonte}" data-foto-topo="${ajustes.foto_topo}" data-foto-produto="${ajustes.foto_produto}" data-colunas="${ajustes.colunas_celular}" data-zap="${zap ? "1" : ""}" data-moeda="${esc(ajustes.moeda)}">
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>${banner}
    <header class="topo">
        <div class="caixa topo__linha">
            <a href="/" class="marca" aria-label="${esc(nome)}, página inicial">${ajustes.logo ? `<img class="marca__logo" src="${esc(ajustes.logo)}" alt="${esc(nome)}">` : `<span class="marca__nome">${esc(nome)}</span><span class="marca__sub">${esc(ajustes.slogan)}</span>`}</a>
            <nav class="menu" aria-label="Menu principal">
                <a href="/#catalogo">${esc(ajustes.titulo_catalogo)}</a>
                ${ajustes.mostrar_como_comprar === "1" ? `<a href="/#como-comprar">${esc(ajustes.titulo_como_comprar)}</a>` : ""}
            </nav>
            ${zap ? `<a class="botao botao--zap botao--pequeno" href="${esc(linkZap(ajustes, `Oi ${primeiroNome(ajustes)}! Vim pelo site.`))}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>WhatsApp</span></a>` : ""}
        </div>
    </header>
    <main id="conteudo">
${conteudo}
    </main>
    <footer class="rodape">
        <div class="caixa rodape__linha">
            <div>
                <p class="rodape__nome">${esc(nome)}</p>
                <p>${esc(ajustes.slogan)}${ajustes.cidade ? ` · ${esc(ajustes.cidade)}` : ""}</p>
            </div>
            ${redes ? `<div class="rodape__redes">${redes}</div>` : ""}
            <p class="rodape__aviso">Revendedora independente. Os nomes e marcas dos produtos pertencem aos seus fabricantes; este site não é oficial de nenhuma marca.</p>
            <p class="rodape__links"><a href="/#catalogo">Catálogo</a> · <a href="/privacidade/">Privacidade</a> · <a href="/conta/entrar/">Painel</a></p>
        </div>
    </footer>
    <div class="sacola" id="sacola" hidden>
        <button type="button" class="sacola__barra" id="sacola-abrir" aria-controls="sacola-lista" aria-expanded="false">
            ${ICONES.sacola}<span id="sacola-resumo">Sacola</span><strong id="sacola-total"></strong>
        </button>
        <div class="sacola__lista" id="sacola-lista" hidden>
            <p class="sacola__titulo">Sua sacola</p>
            <ul id="sacola-itens"></ul>
            <button type="button" class="botao botao--zap botao--largo" id="sacola-enviar">${ICONES.whatsapp}<span>${esc(ajustes.texto_enviar_sacola)}</span></button>
            <button type="button" class="sacola__limpar" id="sacola-limpar">Esvaziar a sacola</button>
        </div>
    </div>
</body>
</html>`;
    return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- Produtos ----------

function precoHtml(p, moeda) {
    if (!p.preco) return '<span class="preco preco--consulte">Consulte o preço</span>';
    const antigo = p.preco_antigo > p.preco ? `<s>${dinheiro(p.preco_antigo, moeda)}</s>` : "";
    return `<span class="preco">${antigo}<strong>${dinheiro(p.preco, moeda)}</strong></span>`;
}

function fotoProduto(p, grande = false) {
    return p.foto
        ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="${grande ? "eager" : "lazy"}" width="600" height="600">`
        : `<span class="produto__sem-foto" aria-hidden="true">${desenhoDa(p.categoria)}</span>`;
}

function cartaoProduto(p, a) {
    const promo = p.preco_antigo > p.preco && p.preco > 0;
    const zap = numeroZap(a);
    return `
                <article class="produto${p.esgotado ? " produto--esgotado" : ""}" data-categoria="${esc(p.categoria)}" data-marca="${esc(p.marca)}" data-busca="${esc(`${p.nome} ${p.marca} ${p.categoria} ${p.descricao}`.toLowerCase())}">
                    <a class="produto__foto" href="/produto/${esc(p.slug)}/">${fotoProduto(p)}
                        ${p.esgotado ? '<span class="etiqueta etiqueta--esgotado">Esgotado</span>' : promo ? '<span class="etiqueta">Promoção</span>' : ""}</a>
                    <div class="produto__texto">
                        ${rotuloProduto(p) ? `<p class="produto__categoria">${esc(rotuloProduto(p))}</p>` : ""}
                        <h3><a href="/produto/${esc(p.slug)}/">${esc(p.nome)}</a></h3>
                        ${precoHtml(p, a.moeda)}
                    </div>
                    ${p.esgotado ? `<a class="botao botao--contorno botao--largo" href="${zap ? `/pedir/${esc(p.slug)}` : `/produto/${esc(p.slug)}/`}" ${zap ? 'target="_blank" rel="noopener"' : ""}><span class="texto-longo">Avise quando chegar</span><span class="texto-curto">Em breve</span></a>`
                        : `<div class="produto__acoes">
                        ${zap ? `<a class="botao botao--zap" href="/pedir/${esc(p.slug)}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>${esc(a.texto_pedir)}</span></a>` : ""}
                        <button type="button" class="botao botao--sacola" data-sacola="${esc(p.slug)}" data-nome="${esc(p.nome)}" data-preco="${p.preco}" aria-label="Colocar ${esc(p.nome)} na sacola" title="Colocar na sacola">${ICONES.sacola}${ICONES.mais}</button>
                    </div>`}
                </article>`;
}

export async function paginaInicial(request, env) {
    const db = env.DB;
    const a = await lerAjustes(db);
    const { results: produtos } = await db.prepare("SELECT * FROM produtos WHERE ativo = 1 ORDER BY esgotado, ordem, id DESC").all();
    const destaques = produtos.filter((p) => (p.destaque || (p.preco_antigo > p.preco && p.preco > 0)) && !p.esgotado).slice(0, 8);
    const usadas = new Set(produtos.map((p) => p.categoria).filter(Boolean));
    const categorias = [...categoriasDe(a).filter((c) => usadas.has(c)), ...[...usadas].filter((c) => !categoriasDe(a).includes(c))];
    const usadasMarcas = new Set(produtos.map((p) => p.marca).filter(Boolean));
    const marcas = [...marcasDe(a).filter((m) => usadasMarcas.has(m)), ...[...usadasMarcas].filter((m) => !marcasDe(a).includes(m))];
    const zap = numeroZap(a);
    const listaCategorias = categorias.length ? categorias : categoriasDe(a);
    const secoes = {
        categorias: `        ${a.mostrar_categorias === "1" && listaCategorias.length > 1 ? `<section class="secao secao--categorias" id="categorias">
            <div class="caixa">
                <h2 class="secao__titulo">${tituloSecao(a.titulo_categorias)}</h2>
                <div class="categorias">${listaCategorias.map((c, i) => `
                    <a class="categoria categoria--${i % 6}" href="#catalogo" data-ir-categoria="${esc(c)}">${desenhoDa(c)}<span>${esc(c)}</span></a>`).join("")}
                </div>
            </div>
        </section>` : ""}`,
        sobre: `        ${a.mostrar_sobre === "1" && a.apresentacao ? `<section class="secao" id="sobre">
            <div class="caixa">
                <div class="sobre">
                    ${a.foto ? `<img class="sobre__foto" src="${esc(a.foto)}" alt="Foto de ${esc(a.nome)}" width="120" height="120" loading="lazy">` : `<span class="sobre__foto sobre__letra" aria-hidden="true">${esc(primeiroNome(a)[0] || "N")}</span>`}
                    <div>
                        <h2 class="secao__titulo">${tituloSecao(a.titulo_sobre)}</h2>
                        <p>${esc(a.apresentacao)}</p>
                        ${marcasDe(a).length ? `<p class="sobre__marcas">Revendedora ${esc(listaTexto(marcasDe(a)))}.</p>` : ""}
                    </div>
                </div>
            </div>
        </section>` : ""}`,
        destaques: `        ${destaques.length && a.mostrar_destaques === "1" ? `<section class="secao" id="destaques">
            <div class="caixa">
                <h2 class="secao__titulo">${tituloSecao(a.titulo_destaques)}</h2>
                <div class="produtos produtos--linha">${destaques.map((p) => cartaoProduto(p, a)).join("")}
                </div>
            </div>
        </section>` : ""}`,
        catalogo: `        <section class="secao secao--catalogo" id="catalogo">
            <div class="caixa">
                <h2 class="secao__titulo">${tituloSecao(a.titulo_catalogo)}</h2>
                ${produtos.length ? `
                <div class="catalogo__ferramentas">
                    <label class="busca"><span class="sr-only">Procurar produto</span>
                        <input type="search" id="busca" placeholder="Procurar: pote, perfume, kit…" autocomplete="off"></label>
                    ${categorias.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por categoria">
                        <button type="button" class="filtro" data-filtro="" aria-pressed="true">Tudo</button>
                        ${categorias.map((c) => `<button type="button" class="filtro" data-filtro="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}
                    </div>` : ""}
                    ${marcas.length > 1 ? `<div class="filtros filtros--marcas" role="group" aria-label="Filtrar por marca">
                        <button type="button" class="filtro" data-filtro-marca="" aria-pressed="true">Todas as marcas</button>
                        ${marcas.map((m) => `<button type="button" class="filtro" data-filtro-marca="${esc(m)}" aria-pressed="false">${esc(m)}</button>`).join("")}
                    </div>` : ""}
                </div>
                <div class="produtos" id="produtos">${produtos.map((p) => cartaoProduto(p, a)).join("")}
                </div>
                <p class="catalogo__vazio" id="nada" hidden>Não achei nada com essa busca. ${zap ? `<a href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Você tem `))}" target="_blank" rel="noopener">Pergunte pra mim no WhatsApp</a>: muita coisa chega por encomenda.` : ""}</p>`
                : `<p class="catalogo__vazio">Os produtos estão chegando. ${zap ? `Enquanto isso, <a href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Queria ver o catálogo.`))}" target="_blank" rel="noopener">me chame no WhatsApp</a> que eu mando as novidades.` : ""}</p>`}
            </div>
        </section>`,
        como_comprar: `        ${a.mostrar_como_comprar === "1" ? `<section class="secao" id="como-comprar">
            <div class="caixa">
                <h2 class="secao__titulo">${tituloSecao(a.titulo_como_comprar)}</h2>
                <ol class="passos">
                    <li><span>1</span><strong>Escolha</strong><p>Toque em <b>${esc(a.texto_pedir)}</b> no produto, ou junte vários na <b>sacola</b>.</p></li>
                    <li><span>2</span><strong>Me chame no WhatsApp</strong><p>A mensagem já vai pronta com o que você escolheu. Eu confirmo se tem e o valor.</p></li>
                    <li><span>3</span><strong>Combine o dia e o local</strong><p>${esc(a.entrega)}</p></li>
                </ol>
                ${a.mostrar_pagamento === "1" && a.pagamento ? `<p class="pagamento"><strong>Pagamento:</strong> ${esc(a.pagamento)}</p>` : ""}
            </div>
        </section>` : a.mostrar_pagamento === "1" && a.pagamento ? `<section class="secao"><div class="caixa"><p class="pagamento"><strong>Pagamento:</strong> ${esc(a.pagamento)}</p></div></section>` : ""}`,
    };
    return pagina(request, a, {
        inicio: true,
        titulo: a.nome,
        descricao: `${a.slogan}${a.cidade ? ` em ${a.cidade}` : ""}. Veja o catálogo e peça pelo WhatsApp.`,
        conteudo: `
        <section class="topo-loja">
            <div class="caixa">
                <div class="vitrine">
                    ${a.foto && a.foto_topo !== "sem" ? `<img class="vitrine__foto${a.foto_topo === "quadrada" ? " vitrine__foto--quadrada" : ""}" src="${esc(a.foto)}" alt="Foto de ${esc(a.nome)}" width="84" height="84">` : ""}
                    <p class="vitrine__local">${a.cidade ? `${esc(a.cidade)} e região` : "Atendimento pelo WhatsApp"}</p>
                    <h1>${esc(a.slogan)}</h1>
                    <p class="vitrine__frase">${esc(a.texto_topo)}</p>
                    <div class="vitrine__acoes">
                        <a class="botao botao--claro" href="#catalogo">${esc(a.texto_ver_catalogo)}</a>
                        ${zap ? `<a class="botao botao--transparente" href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Vim pelo site e queria uma ajuda.`))}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>${esc(a.texto_falar)}</span></a>` : ""}
                    </div>
                </div>
                ${marcasDe(a).length ? `<ul class="marcas" aria-label="Marcas que eu revendo">${marcasDe(a).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
            </div>
        </section>

        ${ordemDasSecoes(a).map((k) => secoes[k]).join("\n\n")}`,
    });
}

export async function paginaProduto(request, env, slug) {
    const db = env.DB;
    const a = await lerAjustes(db);
    const p = await db.prepare("SELECT * FROM produtos WHERE slug = ? AND ativo = 1").bind(slug).first();
    if (!p) {
        return pagina(request, a, { titulo: "Produto não encontrado", descricao: "Este produto não está mais no catálogo.", status: 404, indexar: false,
            conteudo: `<section class="secao"><div class="caixa caixa--estreita"><h1 class="titulo-pagina">Produto não encontrado</h1>
                <p>Ele pode ter saído do catálogo.</p><p><a class="botao" href="/#catalogo">Ver o catálogo</a></p></div></section>` });
    }
    const url = new URL(request.url);
    const { results: parecidos } = await db.prepare(
        "SELECT * FROM produtos WHERE ativo = 1 AND esgotado = 0 AND categoria = ? AND id != ? ORDER BY destaque DESC, ordem, id DESC LIMIT 4").bind(p.categoria, p.id).all();
    const zap = numeroZap(a);
    const dados = {
        "@context": "https://schema.org", "@type": "Product", name: p.nome, description: p.descricao || p.nome,
        ...(p.foto ? { image: new URL(p.foto, url.origin).toString() } : {}),
        ...(p.categoria ? { category: p.categoria } : {}),
        ...(p.marca ? { brand: { "@type": "Brand", name: p.marca } } : {}),
        ...(p.preco ? { offers: { "@type": "Offer", price: (p.preco / 100).toFixed(2), priceCurrency: a.moeda === "EUR" ? "EUR" : "BRL",
            availability: p.esgotado ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: `${url.origin}/produto/${p.slug}/` } } : {}),
    };
    const paragrafos = String(p.descricao || "").split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");
    return pagina(request, a, {
        titulo: p.nome,
        descricao: (p.descricao || `${p.nome} · ${a.slogan}`).slice(0, 160),
        imagem: p.foto,
        tipo: "product",
        extraHead: `\n    <script type="application/ld+json">${JSON.stringify(dados).replace(/</g, "\\u003c")}</script>`,
        conteudo: `
        <section class="secao produto-pagina">
            <div class="caixa">
                <a class="voltar" href="/#catalogo">${ICONES.voltar}Catálogo</a>
                <div class="produto-pagina__grade">
                    <div class="produto-pagina__foto">${fotoProduto(p, true)}</div>
                    <div class="produto-pagina__texto">
                        ${rotuloProduto(p) ? `<p class="produto__categoria">${esc(rotuloProduto(p))}</p>` : ""}
                        <h1 class="titulo-pagina">${esc(p.nome)}</h1>
                        ${p.esgotado ? '<p class="etiqueta etiqueta--esgotado etiqueta--solta">Esgotado no momento</p>' : ""}
                        ${precoHtml(p, a.moeda)}
                        ${paragrafos ? `<div class="produto-pagina__descricao">${paragrafos}</div>` : ""}
                        <div class="produto-pagina__acoes">
                            ${zap ? `<a class="botao botao--zap botao--largo" href="/pedir/${esc(p.slug)}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>${p.esgotado ? "Avise quando chegar" : "Pedir no WhatsApp"}</span></a>` : ""}
                            ${p.esgotado ? "" : `<button type="button" class="botao botao--contorno botao--largo" data-sacola="${esc(p.slug)}" data-nome="${esc(p.nome)}" data-preco="${p.preco}">${ICONES.sacola}<span>Colocar na sacola</span></button>`}
                        </div>
                        <p class="produto-pagina__entrega">${esc(a.entrega)}</p>
                    </div>
                </div>
            </div>
        </section>
        ${parecidos.length ? `<section class="secao">
            <div class="caixa">
                <h2 class="secao__titulo">Você também <em>pode gostar</em></h2>
                <div class="produtos produtos--linha">${parecidos.map((x) => cartaoProduto(x, a)).join("")}
                </div>
            </div>
        </section>` : ""}`,
    });
}

// ---------- Pedidos (WhatsApp) ----------

const ROBOS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|curl|wget|python|headless|monitor|scanner|axios|okhttp|go-http|java\/|node-fetch|undici|libwww/i;

// Só conta pedidos de pessoas: não robôs, verificadores de link, pré-carregamento nem quem está logado no painel
function pedidoDePessoa(request, navegacao = true) {
    const h = (n) => request.headers.get(n) || "";
    if (!h("User-Agent") || ROBOS.test(h("User-Agent"))) return false;
    if (/prefetch|prerender/i.test(`${h("Sec-Purpose")} ${h("Purpose")}`)) return false;
    if (/(^|;\s*)sessao=/.test(h("Cookie"))) return false;
    if (!navegacao) return true;
    return h("Sec-Fetch-Mode") ? h("Sec-Fetch-Mode") === "navigate" : h("Accept").includes("text/html");
}

async function contarPedido(request, db, produtoId) {
    const dia = new Date().toISOString().slice(0, 10);
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
        `${request.headers.get("CF-Connecting-IP") || ""}|${request.headers.get("User-Agent") || ""}|${dia}|${produtoId}|pedido`));
    const codigo = [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
    const novo = await db.prepare("INSERT OR IGNORE INTO pedidos_vistos (dia, codigo) VALUES (?, ?)").bind(dia, codigo).run();
    if (!novo.meta?.changes) return;
    await db.batch([
        db.prepare("INSERT INTO pedidos (produto_id, dia, n) VALUES (?, ?, 1) ON CONFLICT(produto_id, dia) DO UPDATE SET n = n + 1").bind(produtoId, dia),
        db.prepare("DELETE FROM pedidos_vistos WHERE dia < ?").bind(dia),
    ]);
}

export async function pedir(request, env, ctx, slug) {
    const db = env.DB;
    const a = await lerAjustes(db);
    const p = await db.prepare("SELECT * FROM produtos WHERE slug = ? AND ativo = 1").bind(slug).first();
    const url = new URL(request.url);
    if (!p || !numeroZap(a)) return Response.redirect(new URL(p ? `/produto/${p.slug}/` : "/#catalogo", url).toString(), 302);
    if (request.method === "GET" && pedidoDePessoa(request)) ctx.waitUntil(contarPedido(request, db, p.id).catch((e) => console.error("Pedido não contado", e)));
    const texto = p.esgotado
        ? `Oi ${primeiroNome(a)}! Vi no site que o *${p.nome}* está esgotado. Me avisa quando chegar?\n${url.origin}/produto/${p.slug}/`
        : `Oi ${primeiroNome(a)}! Vi no site e quero:\n• *${p.nome}*${p.preco ? ` (${dinheiro(p.preco, a.moeda)})` : ""}\n${url.origin}/produto/${p.slug}/`;
    return new Response(null, { status: 302, headers: { Location: linkZap(a, texto), "Cache-Control": "no-store" } });
}

export async function sacola(request, env, ctx) {
    const db = env.DB;
    const url = new URL(request.url);
    const origem = request.headers.get("Origin");
    if (!origem || new URL(origem).host !== url.host) return Response.json({ erro: "Origem não permitida." }, { status: 403 });
    let d;
    try { d = await request.json(); } catch { return Response.json({ erro: "Dados inválidos." }, { status: 400 }); }
    const pedidos = (Array.isArray(d?.itens) ? d.itens : []).slice(0, 40)
        .map((i) => ({ slug: String(i?.slug || "").slice(0, 80), qtd: Math.min(99, Math.max(1, Math.floor(Number(i?.qtd) || 1))) }))
        .filter((i) => /^[a-z0-9-]+$/.test(i.slug));
    if (!pedidos.length) return Response.json({ erro: "A sacola está vazia." }, { status: 422 });
    const a = await lerAjustes(db);
    if (!numeroZap(a)) return Response.json({ erro: "O WhatsApp da loja ainda não foi configurado." }, { status: 503 });
    const { results } = await db.prepare(`SELECT * FROM produtos WHERE ativo = 1 AND esgotado = 0 AND slug IN (${pedidos.map(() => "?").join(",")})`)
        .bind(...pedidos.map((i) => i.slug)).all();
    const porSlug = new Map(results.map((p) => [p.slug, p]));
    const itens = pedidos.filter((i) => porSlug.has(i.slug)).map((i) => ({ ...i, p: porSlug.get(i.slug) }));
    if (!itens.length) return Response.json({ erro: "Os produtos da sacola não estão mais disponíveis." }, { status: 422 });
    if (pedidoDePessoa(request, false)) ctx.waitUntil(Promise.all(itens.map((i) => contarPedido(request, db, i.p.id))).catch((e) => console.error("Pedido não contado", e)));
    const total = itens.reduce((s, i) => s + i.p.preco * i.qtd, 0);
    const consulte = itens.some((i) => !i.p.preco);
    const linhas = itens.map((i) => `• ${i.qtd}x *${i.p.nome}*${i.p.preco ? ` (${dinheiro(i.p.preco * i.qtd, a.moeda)})` : ""}`);
    const texto = `Oi ${primeiroNome(a)}! Vi no site e quero:\n${linhas.join("\n")}\n\nTotal: ${dinheiro(total, a.moeda)}${consulte ? " + itens a consultar" : ""}`;
    return Response.json({ link: linkZap(a, texto), removidos: pedidos.length - itens.length });
}

// ---------- Imagens, sitemap e privacidade ----------

export async function imagem(env, id) {
    const img = await env.DB.prepare("SELECT tipo, dados FROM imagens WHERE id = ?").bind(id).first();
    if (!img) return new Response("Imagem não encontrada", { status: 404 });
    return new Response(new Uint8Array(img.dados), {
        headers: { "Content-Type": img.tipo, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
}

export async function sitemap(request, env) {
    const origem = new URL(request.url).origin;
    const { results } = await env.DB.prepare("SELECT slug, atualizado_em FROM produtos WHERE ativo = 1 ORDER BY id").all();
    const urls = [[`${origem}/`, ""], ...results.map((p) => [`${origem}/produto/${p.slug}/`, p.atualizado_em.slice(0, 10)])];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
        urls.map(([u, d]) => `\n  <url>\n    <loc>${esc(u)}</loc>${d ? `\n    <lastmod>${d}</lastmod>` : ""}\n  </url>`).join("")}\n</urlset>\n`;
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

export async function paginaPrivacidade(request, env) {
    const a = await lerAjustes(env.DB);
    const contato = numeroZap(a) ? `<a href="${esc(linkZap(a, "Oi! Tenho uma dúvida sobre os meus dados."))}" target="_blank" rel="noopener">WhatsApp</a>`
        : a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : "as redes sociais da loja";
    return pagina(request, a, {
        titulo: "Privacidade",
        descricao: "Como este site trata os dados de quem visita.",
        conteudo: `
        <article class="secao texto-legal">
            <div class="caixa caixa--estreita">
                <h1 class="titulo-pagina">Política de privacidade</h1>
                <p class="nota">Última atualização: 12 de novembro de 2026</p>
                <p>Este site é de <strong>${esc(a.nome)}</strong>, revendedora independente. Aqui explico, de forma simples, o que acontece com os seus dados quando você visita o site. Esta política segue a LGPD.</p>
                <h2>O que coletamos</h2>
                <ul>
                    <li><strong>Visitantes:</strong> o site não tem cadastro de visitantes, não usa cookies de publicidade nem de rastreamento e não guarda o seu endereço IP.</li>
                    <li><strong>Pedidos:</strong> quando você toca em "Pedir" ou envia a sacola, o site soma 1 ao total de pedidos daquele produto no dia (no máximo uma vez por pessoa), sem saber quem pediu. O pedido em si acontece no WhatsApp, entre você e a loja.</li>
                    <li><strong>Sacola:</strong> os produtos que você coloca na sacola ficam guardados só no seu próprio celular ou computador, até você enviar ou esvaziar.</li>
                    <li><strong>Painel:</strong> só a administradora tem conta (nome, e-mail e senha guardada com proteção), com o cookie <code>sessao</code>, necessário para entrar.</li>
                </ul>
                <h2>Serviços de terceiros</h2>
                <ul>
                    <li><strong>Cloudflare:</strong> hospedagem do site e banco de dados.</li>
                    <li><strong>Google Fonts:</strong> as fontes do site vêm dos servidores do Google, que recebem o endereço IP de quem visita.</li>
                    <li><strong>WhatsApp:</strong> ao pedir, você sai deste site e passam a valer as regras de privacidade do WhatsApp.</li>
                </ul>
                <h2>Os seus direitos</h2>
                <p>Você pode pedir informações sobre os seus dados, correção ou exclusão. Fale comigo pelo ${contato}. Se não ficar satisfeito, pode reclamar à <a href="https://www.gov.br/anpd" target="_blank" rel="noopener">ANPD</a>.</p>
                <h2>Marcas</h2>
                <p>Sou revendedora independente. Os nomes e marcas dos produtos pertencem aos seus fabricantes, e este site não é oficial de nenhuma marca.</p>
            </div>
        </article>`,
    });
}
