// Painel da loja (só e-mails do segredo ADMIN_EMAILS).
//
//   GET    /api/admin/eu                    nome e e-mail de quem está logado
//   GET    /api/admin/resumo?de=&ate=       pedidos no período, por produto, e os produtos sem nenhum pedido
//   GET    /api/admin/produtos              produtos com os pedidos dos últimos 30 dias
//   POST   /api/admin/produtos              cria { nome, slug, categoria, descricao, preco, preco_antigo, foto, destaque, esgotado, ativo }
//   PUT    /api/admin/produtos/<id>         altera
//   PATCH  /api/admin/produtos/<id>         muda só { esgotado } ou { ativo } ou { destaque } (botões rápidos da lista)
//   DELETE /api/admin/produtos/<id>         apaga (e os pedidos contados dele)
//   POST   /api/admin/produtos/ordem        { ids: [...] } nova ordem
//   GET    /api/admin/aparencia             tema, fonte, logo, faixa de aviso e seções da página inicial
//   PUT    /api/admin/aparencia             salva ({ original: true } volta tudo ao original)
//   GET    /api/admin/ajustes               dados da loja
//   PUT    /api/admin/ajustes               salva os dados da loja
//   POST   /api/admin/imagens               envia uma imagem (JPEG, PNG ou WebP até 1,8 MB) e devolve o endereço
import { alunoLogado, ehAdmin, json } from "./contas.js";
import { AJUSTES_PADRAO, APARENCIA_PADRAO, FONTES, OPCOES_APARENCIA, SECOES_INICIO, TEMAS, TEXTOS, ordemDasSecoes, categoriasDe, garantirTabelasLoja, lerAjustes } from "./loja.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_OK = /^https:\/\/[^\s"'<>]+$/;
const IMAGEM_OK = /^\/imagens\/[a-f0-9]{32}$/;

// ---------- Imagens ----------

const TIPOS = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };
async function enviarImagem(request, db) {
    const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!TIPOS[tipo]) return json({ erro: "Envie uma imagem JPG, PNG ou WebP." }, 415);
    const dados = new Uint8Array(await request.arrayBuffer());
    if (!dados.length) return json({ erro: "A imagem chegou vazia." }, 400);
    if (dados.length > 1_800_000) return json({ erro: "A imagem passou de 1,8 MB mesmo depois de reduzida. Tente outra." }, 413);
    const confere = TIPOS[tipo].every((b, i) => dados[i] === b) && (tipo !== "image/webp" || String.fromCharCode(...dados.slice(8, 12)) === "WEBP");
    if (!confere) return json({ erro: "O arquivo não parece ser uma imagem válida." }, 415);
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.prepare("INSERT INTO imagens (id, tipo, dados, tamanho) VALUES (?, ?, ?, ?)").bind(id, tipo, dados, dados.length).run();
    return json({ url: `/imagens/${id}` }, 201);
}

// ---------- Produtos ----------

// Aceita "89,90", "89.90", "R$ 1.299,90" ou número; devolve centavos
function centavos(valor) {
    if (valor === "" || valor === null || valor === undefined) return 0;
    if (typeof valor === "number") return Math.round(valor * 100);
    let t = String(valor).replace(/[^\d.,]/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

async function lerProduto(request) {
    let d;
    try { d = await request.json(); } catch { return { erro: "Dados inválidos." }; }
    const texto = (v, max) => String(v ?? "").trim().slice(0, max);
    const p = {
        nome: texto(d?.nome, 100),
        slug: texto(d?.slug, 80).toLowerCase(),
        categoria: texto(d?.categoria, 40),
        descricao: texto(d?.descricao, 1500),
        preco: centavos(d?.preco),
        preco_antigo: centavos(d?.preco_antigo),
        foto: texto(d?.foto, 100),
        destaque: d?.destaque ? 1 : 0,
        esgotado: d?.esgotado ? 1 : 0,
        ativo: d?.ativo === false ? 0 : 1,
    };
    if (!p.nome) return { erro: "Informe o nome do produto." };
    if (!SLUG.test(p.slug)) return { erro: "O endereço só pode ter letras minúsculas, números e hífens (ex.: kit-perfume-floral)." };
    if (Number.isNaN(p.preco) || Number.isNaN(p.preco_antigo)) return { erro: "Preço inválido. Escreva só o número, por exemplo 89,90." };
    if (p.preco > 10_000_000 || p.preco_antigo > 10_000_000) return { erro: "Preço alto demais. Confira o valor." };
    if (p.preco_antigo && p.preco_antigo <= p.preco) return { erro: "O preço \"de\" (antigo) precisa ser maior que o preço atual. Deixe vazio se não for promoção." };
    if (p.foto && !IMAGEM_OK.test(p.foto)) return { erro: "Foto inválida. Envie pelo botão." };
    return p;
}

async function rotasProdutos(request, url, metodo, db) {
    if (url.pathname === "/api/admin/produtos" && metodo === "GET") {
        const a = await lerAjustes(db);
        const { results } = await db.prepare(
            `SELECT p.*, COALESCE((SELECT SUM(n) FROM pedidos c WHERE c.produto_id = p.id AND c.dia >= date('now', '-29 days')), 0) AS pedidos30,
                    COALESCE((SELECT SUM(n) FROM pedidos c WHERE c.produto_id = p.id), 0) AS pedidos_total
             FROM produtos p ORDER BY p.ordem, p.id DESC`).all();
        return json({ produtos: results, categorias: categoriasDe(a), moeda: a.moeda });
    }
    if (url.pathname === "/api/admin/produtos/ordem" && metodo === "POST") {
        let d;
        try { d = await request.json(); } catch { return json({ erro: "Dados inválidos." }, 400); }
        const ids = Array.isArray(d?.ids) ? d.ids.map(Number) : [];
        const { results } = await db.prepare("SELECT id FROM produtos").all();
        const atuais = new Set(results.map((r) => r.id));
        if (ids.length !== atuais.size || new Set(ids).size !== ids.length || !ids.every((i) => atuais.has(i))) {
            return json({ erro: "A lista mudou. Recarregue a página." }, 409);
        }
        await db.batch(ids.map((id, i) => db.prepare("UPDATE produtos SET ordem = ? WHERE id = ?").bind(i + 1, id)));
        return json({ ok: true });
    }
    const m = /^\/api\/admin\/produtos(?:\/(\d+))?$/.exec(url.pathname);
    if (!m) return json({ erro: "Não encontrado." }, 404);
    const id = m[1] ? Number(m[1]) : null;
    if (id && metodo === "GET") {
        const p = await db.prepare("SELECT * FROM produtos WHERE id = ?").bind(id).first();
        return p ? json(p) : json({ erro: "Produto não encontrado." }, 404);
    }
    if (id && metodo === "DELETE") {
        await db.batch([db.prepare("DELETE FROM pedidos WHERE produto_id = ?").bind(id), db.prepare("DELETE FROM produtos WHERE id = ?").bind(id)]);
        return json({ ok: true });
    }
    if (id && metodo === "PATCH") {
        let d;
        try { d = await request.json(); } catch { return json({ erro: "Dados inválidos." }, 400); }
        const campo = ["esgotado", "ativo", "destaque"].find((c) => c in (d || {}));
        if (!campo) return json({ erro: "Nada para mudar." }, 400);
        const r = await db.prepare(`UPDATE produtos SET ${campo} = ?, atualizado_em = datetime('now') WHERE id = ?`).bind(d[campo] ? 1 : 0, id).run();
        return r.meta.changes ? json({ ok: true }) : json({ erro: "Produto não encontrado." }, 404);
    }
    if ((id && metodo === "PUT") || (!id && metodo === "POST")) {
        const p = await lerProduto(request);
        if (p.erro) return json(p, 422);
        const campos = [p.nome, p.slug, p.categoria, p.descricao, p.preco, p.preco_antigo, p.foto, p.destaque, p.esgotado, p.ativo];
        try {
            if (id) {
                const r = await db.prepare(
                    `UPDATE produtos SET nome = ?, slug = ?, categoria = ?, descricao = ?, preco = ?, preco_antigo = ?, foto = ?, destaque = ?, esgotado = ?, ativo = ?,
                     atualizado_em = datetime('now') WHERE id = ?`).bind(...campos, id).run();
                return r.meta.changes ? json({ id }) : json({ erro: "Produto não encontrado." }, 404);
            }
            const novo = await db.prepare(
                `INSERT INTO produtos (nome, slug, categoria, descricao, preco, preco_antigo, foto, destaque, esgotado, ativo, ordem)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MIN(ordem), 1) - 1 FROM produtos)) RETURNING id`).bind(...campos).first();
            return json({ id: novo.id }, 201);
        } catch (erro) {
            if (/UNIQUE/i.test(String(erro))) return json({ erro: "Já existe um produto com esse endereço. Mude o endereço (ex.: acrescente -2)." }, 409);
            throw erro;
        }
    }
    return json({ erro: "Não encontrado." }, 404);
}

// ---------- Dados da loja ----------

async function salvarAjustes(request, db) {
    let d;
    try { d = await request.json(); } catch { return json({ erro: "Dados inválidos." }, 400); }
    const a = {};
    for (const chave of Object.keys(AJUSTES_PADRAO)) a[chave] = String(d?.[chave] ?? "").trim();
    a.whatsapp = a.whatsapp.replace(/\D/g, "");
    a.categorias = a.categorias.split("\n").map((c) => c.trim().slice(0, 40)).filter(Boolean).slice(0, 20).join("\n");
    if (!a.nome || a.nome.length > 40) return json({ erro: "Informe o nome da loja (até 40 caracteres)." }, 422);
    if (a.slogan.length > 80) return json({ erro: "A frase de baixo do nome passou de 80 caracteres." }, 422);
    if (a.apresentacao.length > 400 || a.entrega.length > 300 || a.pagamento.length > 160) return json({ erro: "Algum texto ficou longo demais." }, 422);
    if (a.whatsapp && (a.whatsapp.length < 10 || a.whatsapp.length > 15)) return json({ erro: "WhatsApp inválido. Use o número com o código do país e o DDD, por exemplo 55 11 91234-5678." }, 422);
    if (a.foto && !IMAGEM_OK.test(a.foto)) return json({ erro: "Foto inválida. Envie pelo botão." }, 422);
    if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email)) return json({ erro: "E-mail inválido." }, 422);
    if (!["BRL", "EUR"].includes(a.moeda)) a.moeda = "BRL";
    for (const [rede, padrao] of Object.entries({ instagram: /instagram\.com\//, facebook: /facebook\.com\/|fb\.com\// })) {
        if (a[rede] && (!URL_OK.test(a[rede]) || !padrao.test(a[rede]))) return json({ erro: `Link do ${rede} inválido (copie o link completo do perfil, com https://).` }, 422);
    }
    await db.batch(Object.entries(a).map(([k, v]) => db.prepare("INSERT OR REPLACE INTO ajustes (chave, valor) VALUES (?, ?)").bind(k, v)));
    return json({ ok: true });
}

// ---------- Aparência ----------

async function salvarAparencia(request, db) {
    let d;
    try { d = await request.json(); } catch { return json({ erro: "Dados inválidos." }, 400); }
    const a = d?.original ? { ...APARENCIA_PADRAO } : {
        tema: TEMAS[d?.tema] || (d?.tema === "propria" && /^#[0-9a-f]{6}$/i.test(d?.cor_propria || "")) ? d.tema : APARENCIA_PADRAO.tema,
        cor_propria: /^#[0-9a-f]{6}$/i.test(d?.cor_propria || "") ? d.cor_propria.toUpperCase() : "",
        fonte: FONTES[d?.fonte] ? d.fonte : APARENCIA_PADRAO.fonte,
        logo: String(d?.logo ?? "").trim(),
        banner_texto: String(d?.banner_texto ?? "").trim().slice(0, 140),
        banner_ate: /^\d{4}-\d{2}-\d{2}$/.test(d?.banner_ate || "") ? d.banner_ate : "",
        mostrar_destaques: d?.mostrar_destaques ? "1" : "0",
        mostrar_como_comprar: d?.mostrar_como_comprar ? "1" : "0",
        mostrar_pagamento: d?.mostrar_pagamento ? "1" : "0",
        ...Object.fromEntries(Object.entries(TEXTOS).map(([k, t]) => [k, String(d?.[k] ?? "").trim().slice(0, t.max) || APARENCIA_PADRAO[k]])),
        ordem_secoes: ordemDasSecoes({ ordem_secoes: Array.isArray(d?.ordem_secoes) ? d.ordem_secoes.join(",") : "" }).join(","),
        ...Object.fromEntries(Object.entries(OPCOES_APARENCIA).map(([k, opcoes]) => [k, String(d?.[k]) in opcoes ? String(d[k]) : APARENCIA_PADRAO[k]])),
    };
    if (a.logo && !IMAGEM_OK.test(a.logo)) return json({ erro: "Logo inválido. Envie pelo botão." }, 422);
    await db.batch(Object.entries(a).map(([k, v]) => db.prepare("INSERT OR REPLACE INTO ajustes (chave, valor) VALUES (?, ?)").bind(k, v)));
    return json({ ok: true });
}

// ---------- Resumo ----------

async function resumo(url, db) {
    const data = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || "") ? t : "");
    let ate = data(url.searchParams.get("ate")) || new Date().toISOString().slice(0, 10);
    let de = data(url.searchParams.get("de")) || new Date(Date.parse(ate) - 29 * 86400000).toISOString().slice(0, 10);
    if (de > ate) [de, ate] = [ate, de];
    const [totais, porProduto, dias] = await db.batch([
        db.prepare(`SELECT COALESCE(SUM(CASE WHEN dia = date('now') THEN n END), 0) AS hoje,
                           COALESCE(SUM(CASE WHEN dia BETWEEN ?1 AND ?2 THEN n END), 0) AS periodo,
                           COALESCE(SUM(n), 0) AS total FROM pedidos`).bind(de, ate),
        db.prepare(`SELECT p.id, p.nome, p.ativo, p.esgotado, COALESCE(SUM(CASE WHEN c.dia BETWEEN ?1 AND ?2 THEN c.n END), 0) AS periodo
                    FROM produtos p LEFT JOIN pedidos c ON c.produto_id = p.id GROUP BY p.id HAVING periodo > 0 ORDER BY periodo DESC LIMIT 50`).bind(de, ate),
        db.prepare("SELECT dia, SUM(n) AS n FROM pedidos WHERE dia BETWEEN ?1 AND ?2 GROUP BY dia ORDER BY dia").bind(de, ate),
    ]);
    const { results: semPedidos } = await db.prepare(
        `SELECT p.id, p.nome, p.categoria, p.esgotado FROM produtos p
         WHERE p.ativo = 1 AND date(p.criado_em) <= ?2
           AND NOT EXISTS (SELECT 1 FROM pedidos c WHERE c.produto_id = p.id AND c.dia BETWEEN ?1 AND ?2)
         ORDER BY p.categoria, p.nome`).bind(de, ate).all();
    const contagem = await db.prepare("SELECT COUNT(*) AS todos, COALESCE(SUM(ativo = 1 AND esgotado = 0), 0) AS a_venda, COALESCE(SUM(esgotado = 1), 0) AS esgotados FROM produtos").first();
    return json({ ...totais.results[0], de, ate, produtos: porProduto.results, sem_pedidos: semPedidos, dias: dias.results, contagem });
}

// ---------- Roteamento ----------

export async function rotasAdmin(request, env) {
    const url = new URL(request.url);
    const metodo = request.method;
    if (metodo !== "GET") {
        const origem = request.headers.get("Origin");
        if (!origem || new URL(origem).host !== url.host) return json({ erro: "Origem não permitida." }, 403);
    }
    const db = env.DB;
    await garantirTabelasLoja(db);
    const eu = await alunoLogado(request, env);
    if (!eu) return json({ erro: "Não está logado." }, 401);
    if (!ehAdmin(env, eu.email)) return json({ erro: "Acesso só para administradores." }, 403);

    if (url.pathname === "/api/admin/eu" && metodo === "GET") return json({ nome: eu.nome, email: eu.email });
    if (url.pathname === "/api/admin/imagens" && metodo === "POST") return enviarImagem(request, db);
    if (url.pathname.startsWith("/api/admin/produtos")) return rotasProdutos(request, url, metodo, db);
    if (url.pathname === "/api/admin/resumo" && metodo === "GET") return resumo(url, db);
    if (url.pathname === "/api/admin/ajustes" && metodo === "GET") {
        const a = await lerAjustes(db);
        return json(Object.fromEntries(Object.keys(AJUSTES_PADRAO).map((k) => [k, a[k]])));
    }
    if (url.pathname === "/api/admin/ajustes" && metodo === "PUT") return salvarAjustes(request, db);
    if (url.pathname === "/api/admin/aparencia" && metodo === "GET") {
        const a = await lerAjustes(db);
        return json({ ...Object.fromEntries(Object.keys(APARENCIA_PADRAO).map((k) => [k, a[k]])), nome: a.nome, slogan: a.slogan,
            temas: TEMAS, fontes: Object.fromEntries(Object.entries(FONTES).map(([k, f]) => [k, f.nome])), opcoes: OPCOES_APARENCIA, textos: TEXTOS, padrao: APARENCIA_PADRAO, secoes: SECOES_INICIO, ordem: ordemDasSecoes(a) });
    }
    if (url.pathname === "/api/admin/aparencia" && metodo === "PUT") return salvarAparencia(request, db);
    return json({ erro: "Não encontrado." }, 404);
}
