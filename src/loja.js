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
import { garantirTabelasVisitas } from "./visitas.js";

const TABELAS = [
    `CREATE TABLE IF NOT EXISTS ajustes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        categoria TEXT NOT NULL DEFAULT '',
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
    slogan: "Tupperware, perfumes e kits de beleza",
    apresentacao: "Oi, eu sou a Nelsi! Aqui você encontra Tupperware, perfumes e kits de beleza para você ou para presentear. Escolha o que gostou e me chame no WhatsApp que eu te atendo pessoalmente.",
    whatsapp: "",
    cidade: "Curitiba",
    entrega: "Atendo Curitiba e região. Combine o dia e o local comigo pelo WhatsApp.",
    pagamento: "Pix, dinheiro ou cartão.",
    instagram: "",
    facebook: "",
    email: "",
    foto: "",
    moeda: "BRL",
    categorias: "Tupperware\nPerfumes\nKits de beleza",
};

let prontas = false;
export async function garantirTabelasLoja(db) {
    if (prontas) return;
    await garantirTabelas(db);
    await garantirTabelasVisitas(db);
    await db.batch(TABELAS.map((sql) => db.prepare(sql)));
    const iniciado = await db.prepare("SELECT 1 FROM ajustes WHERE chave = 'iniciado'").first();
    if (!iniciado) {
        await db.batch([
            ...Object.entries(AJUSTES_PADRAO).map(([k, v]) => db.prepare("INSERT OR IGNORE INTO ajustes (chave, valor) VALUES (?, ?)").bind(k, v)),
            db.prepare("INSERT OR IGNORE INTO ajustes (chave, valor) VALUES ('iniciado', datetime('now'))"),
        ]);
    }
    prontas = true;
}

export async function lerAjustes(db) {
    const { results } = await db.prepare("SELECT chave, valor FROM ajustes").all();
    return { ...AJUSTES_PADRAO, ...Object.fromEntries(results.map((r) => [r.chave, r.valor])) };
}

export const categoriasDe = (a) => String(a.categorias || "").split("\n").map((c) => c.trim()).filter(Boolean);

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
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-3.6A8 8 0 1 1 8 19.2z"/><path class="cheio" d="M9 8.6c.3 2.8 2.4 5 5.2 5.6l1-1.3 1.9.9-.3 1.6c-4.1.2-7.9-3.5-7.9-7.6l1.6-.4.9 1.9z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="cheio" cx="17.5" cy="6.5" r="1"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H9.2v3h2.5V21"/></svg>',
    sacola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>',
    mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    // Desenhos para produto sem foto, por categoria
    pote: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="16" width="30" height="22" rx="5"/><path d="M7 16h34v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2z"/><path d="M15 24h18"/></svg>',
    perfume: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="18" width="24" height="22" rx="6"/><path d="M19 18v-5h10v5M21 13V8h6v5"/><path d="M18 30c4-3 8 3 12 0"/></svg>',
    beleza: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="22" width="12" height="18" rx="3"/><path d="M13 22v-7l6-3v10"/><rect x="26" y="16" width="12" height="24" rx="6"/><path d="M29 22h6"/></svg>',
    presente: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="20" width="30" height="20" rx="3"/><path d="M7 14h34v6H7zM24 14v26"/><path d="M24 14c-3-6-11-6-9-1 1 2 6 1 9 1zM24 14c3-6 11-6 9-1-1 2-6 1-9 1z"/></svg>',
};

function desenhoDa(categoria) {
    const c = String(categoria || "").toLowerCase();
    if (/tupper|pote|cozinha/.test(c)) return ICONES.pote;
    if (/perfum|col[oô]nia|fragr/.test(c)) return ICONES.perfume;
    if (/beleza|maqui|skin|cuidado|creme/.test(c)) return ICONES.beleza;
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
    const redes = [["instagram", "Instagram", ajustes.instagram], ["facebook", "Facebook", ajustes.facebook]]
        .filter(([, , l]) => /^https:\/\//.test(l || ""))
        .map(([k, rotulo, l]) => `<a class="rede" href="${esc(l)}" target="_blank" rel="noopener" aria-label="${rotulo}" title="${rotulo}">${ICONES[k]}</a>`).join("");
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#8E2445">
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
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <script src="/loja.js" defer></script>${extraHead}
</head>
<body data-zap="${zap ? "1" : ""}" data-moeda="${esc(ajustes.moeda)}">
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>
    <header class="topo">
        <div class="caixa topo__linha">
            <a href="/" class="marca" aria-label="${esc(nome)}, página inicial"><span class="marca__nome">${esc(nome)}</span><span class="marca__sub">${esc(ajustes.slogan)}</span></a>
            <nav class="menu" aria-label="Menu principal">
                <a href="/#catalogo">Catálogo</a>
                <a href="/#como-comprar">Como comprar</a>
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
            <button type="button" class="botao botao--zap botao--largo" id="sacola-enviar">${ICONES.whatsapp}<span>Enviar pedido no WhatsApp</span></button>
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
                <article class="produto${p.esgotado ? " produto--esgotado" : ""}" data-categoria="${esc(p.categoria)}" data-busca="${esc(`${p.nome} ${p.categoria} ${p.descricao}`.toLowerCase())}">
                    <a class="produto__foto" href="/produto/${esc(p.slug)}/">${fotoProduto(p)}
                        ${p.esgotado ? '<span class="etiqueta etiqueta--esgotado">Esgotado</span>' : promo ? '<span class="etiqueta">Promoção</span>' : ""}</a>
                    <div class="produto__texto">
                        ${p.categoria ? `<p class="produto__categoria">${esc(p.categoria)}</p>` : ""}
                        <h3><a href="/produto/${esc(p.slug)}/">${esc(p.nome)}</a></h3>
                        ${precoHtml(p, a.moeda)}
                    </div>
                    ${p.esgotado ? `<a class="botao botao--contorno botao--largo" href="${zap ? `/pedir/${esc(p.slug)}` : `/produto/${esc(p.slug)}/`}" ${zap ? 'target="_blank" rel="noopener"' : ""}>Avise quando chegar</a>`
                        : `<div class="produto__acoes">
                        ${zap ? `<a class="botao botao--zap" href="/pedir/${esc(p.slug)}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>Pedir</span></a>` : ""}
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
    const zap = numeroZap(a);
    const foto = a.foto
        ? `<img src="${esc(a.foto)}" alt="Foto de ${esc(a.nome)}" width="320" height="320">`
        : `<span class="apresenta__letra" aria-hidden="true">${esc(primeiroNome(a)[0] || "N")}</span>`;
    return pagina(request, a, {
        inicio: true,
        titulo: a.nome,
        descricao: `${a.slogan}${a.cidade ? ` em ${a.cidade}` : ""}. Veja o catálogo e peça pelo WhatsApp.`,
        conteudo: `
        <section class="apresenta">
            <div class="caixa apresenta__grade">
                <div class="apresenta__texto">
                    <p class="apresenta__ola">${a.cidade ? `${esc(a.cidade)} · ` : ""}atendimento pelo WhatsApp</p>
                    <h1>${esc(a.slogan)}</h1>
                    <p class="apresenta__lead">${esc(a.apresentacao)}</p>
                    <div class="apresenta__acoes">
                        <a class="botao" href="#catalogo">Ver o catálogo</a>
                        ${zap ? `<a class="botao botao--zap" href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Vim pelo site e queria uma ajuda.`))}" target="_blank" rel="noopener">${ICONES.whatsapp}<span>Falar comigo</span></a>` : ""}
                    </div>
                </div>
                <div class="apresenta__foto">${foto}</div>
            </div>
        </section>

        ${destaques.length ? `<section class="secao" id="destaques">
            <div class="caixa">
                <h2 class="secao__titulo">Destaques e <em>promoções</em></h2>
                <div class="produtos produtos--linha">${destaques.map((p) => cartaoProduto(p, a)).join("")}
                </div>
            </div>
        </section>` : ""}

        <section class="secao secao--catalogo" id="catalogo">
            <div class="caixa">
                <h2 class="secao__titulo">Catálogo</h2>
                ${produtos.length ? `
                <div class="catalogo__ferramentas">
                    <label class="busca"><span class="sr-only">Procurar produto</span>
                        <input type="search" id="busca" placeholder="Procurar: pote, perfume, kit…" autocomplete="off"></label>
                    ${categorias.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por categoria">
                        <button type="button" class="filtro" data-filtro="" aria-pressed="true">Tudo</button>
                        ${categorias.map((c) => `<button type="button" class="filtro" data-filtro="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}
                    </div>` : ""}
                </div>
                <div class="produtos" id="produtos">${produtos.map((p) => cartaoProduto(p, a)).join("")}
                </div>
                <p class="catalogo__vazio" id="nada" hidden>Não achei nada com essa busca. ${zap ? `<a href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Você tem `))}" target="_blank" rel="noopener">Pergunte pra mim no WhatsApp</a>: muita coisa chega por encomenda.` : ""}</p>`
                : `<p class="catalogo__vazio">Os produtos estão chegando. ${zap ? `Enquanto isso, <a href="${esc(linkZap(a, `Oi ${primeiroNome(a)}! Queria ver o catálogo.`))}" target="_blank" rel="noopener">me chame no WhatsApp</a> que eu mando as novidades.` : ""}</p>`}
            </div>
        </section>

        <section class="secao" id="como-comprar">
            <div class="caixa">
                <h2 class="secao__titulo">Como <em>comprar</em></h2>
                <ol class="passos">
                    <li><span>1</span><strong>Escolha</strong><p>Toque em <b>Pedir</b> no produto, ou junte vários na <b>sacola</b>.</p></li>
                    <li><span>2</span><strong>Me chame no WhatsApp</strong><p>A mensagem já vai pronta com o que você escolheu. Eu confirmo se tem e o valor.</p></li>
                    <li><span>3</span><strong>Combine o dia e o local</strong><p>${esc(a.entrega)}</p></li>
                </ol>
                <p class="pagamento"><strong>Pagamento:</strong> ${esc(a.pagamento)}</p>
            </div>
        </section>`,
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
                        ${p.categoria ? `<p class="produto__categoria">${esc(p.categoria)}</p>` : ""}
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
                    <li><strong>Visitas:</strong> o site conta quantas vezes cada página foi aberta e de onde a pessoa veio (por exemplo Instagram ou Google), sem cookies e sem guardar o seu endereço IP. Para saber quantas pessoas diferentes visitaram no dia, usamos um código embaralhado que não identifica você e é apagado no dia seguinte.</li>
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
