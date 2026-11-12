// Painel da loja da Nelsi: Painel (visitas e pedidos), Produtos e Dados da loja.
// Conversa com as rotas /api/admin/* do Worker (src/admin.js). Navegação pelo endereço: #/, #/produtos, #/produtos/<id>, #/produtos/novo, #/loja.
const conteudo = document.getElementById("conteudo");
const titulo = document.querySelector(".adm-barra__titulo");
const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const ICONES = {
    lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
};
let moedaLoja = "BRL";
const dinheiro = (c) => new Intl.NumberFormat(moedaLoja === "EUR" ? "pt-PT" : "pt-BR", { style: "currency", currency: moedaLoja === "EUR" ? "EUR" : "BRL" }).format((c || 0) / 100);
const precoCampo = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

// Texto do usuário entra sempre escapado
function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Datas do banco vêm em UTC ("2026-11-09 18:30:00")
function data(valor, comHora = false) {
    if (!valor) return "—";
    const d = new Date(valor.replace(" ", "T") + "Z");
    return (comHora ? formatoDataHora : formatoData).format(d);
}

function iniciais(nome) {
    const partes = String(nome || "").trim().split(/\s+/);
    return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes.at(-1)[0] : "")).toUpperCase() || "··";
}

async function api(rota, opcoes) {
    const resposta = await fetch(rota, opcoes);
    if (resposta.status === 401) {
        location.replace("/conta/entrar/");
        throw new Error("Não está logado.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw Object.assign(new Error(dados.erro || "Não deu certo."), { status: resposta.status });
    return dados;
}

function aviso(texto, tipo) {
    return texto ? `<p class="adm-aviso adm-aviso--${tipo}" role="status">${esc(texto)}</p>` : "";
}


function slugDe(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// Reduz a imagem no navegador antes de enviar (logos e foto ficam leves)
async function reduzirImagem(arquivo, maximo = 1600) {
    if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(arquivo.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name)) {
        throw new Error("Escolha uma imagem (JPG, PNG ou WebP).");
    }
    let bitmap;
    try { bitmap = await createImageBitmap(arquivo); } catch { throw new Error("Não foi possível abrir esta imagem. Tente salvar como JPG e enviar de novo."); }
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(bitmap.width * escala);
    tela.height = Math.round(bitmap.height * escala);
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(bitmap, 0, 0, tela.width, tela.height);
    const gerar = (tipo, qualidade) => new Promise((ok) => tela.toBlob(ok, tipo, qualidade));
    let blob = await gerar("image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg", 0.85);
    return blob;
}

async function enviarImagem(arquivo, maximo = 1600) {
    const blob = await reduzirImagem(arquivo, maximo);
    const r = await api("/api/admin/imagens", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    return r.url;
}

// ---------- Painel (visitas e pedidos) ----------

const PERIODOS = {
    "7": "Últimos 7 dias",
    "30": "Últimos 30 dias",
    "90": "Últimos 90 dias",
    "mes": "Este mês",
    "mes-passado": "Mês passado",
    "ano": "Este ano",
    "outro": "Outro período…",
};
let periodoPainel = { tipo: "30", de: "", ate: "" };

function datasDoPeriodo({ tipo, de, ate }) {
    const iso = (d) => d.toISOString().slice(0, 10);
    const hoje = new Date();
    const menos = (n) => iso(new Date(Date.now() - n * 86400000));
    const y = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
    if (tipo === "7") return { de: menos(6), ate: iso(hoje) };
    if (tipo === "90") return { de: menos(89), ate: iso(hoje) };
    if (tipo === "mes") return { de: iso(new Date(Date.UTC(y, m, 1))), ate: iso(hoje) };
    if (tipo === "mes-passado") return { de: iso(new Date(Date.UTC(y, m - 1, 1))), ate: iso(new Date(Date.UTC(y, m, 0))) };
    if (tipo === "ano") return { de: `${y}-01-01`, ate: iso(hoje) };
    if (tipo === "outro" && de && ate) return { de, ate };
    return { de: menos(29), ate: iso(hoje) };
}

const NOMES_PAGINAS = {
    "/": "Página inicial (catálogo)", "/privacidade/": "Privacidade",
};

const dataBr = (d) => d.split("-").reverse().join("/");


async function paginaPainel() {
    titulo.textContent = "Painel";
    const { de, ate } = datasDoPeriodo(periodoPainel);
    const r = await api(`/api/admin/resumo?de=${de}&ate=${ate}`);
    const dias = [];
    for (let t = Date.parse(r.de); t <= Date.parse(r.ate); t += 86400000) dias.push(new Date(t).toISOString().slice(0, 10));
    const serie = (lista) => dias.map((dia) => ({ dia, n: lista.find((x) => x.dia === dia)?.n || 0 }));
    const grafico = (lista, rotulo) => {
        const maior = Math.max(1, ...lista.map((d) => d.n));
        return `<div class="adm-grafico ${lista.length > 45 ? "adm-grafico--denso" : ""}" role="img" aria-label="${rotulo} por dia">
            ${lista.map((d) => `<span title="${dataBr(d.dia)}: ${d.n}" style="height:${Math.max(2, (d.n / maior) * 100)}%"></span>`).join("")}</div>`;
    };
    const barras = (itens, nome) => itens.length
        ? `<ul class="adm-barras">${itens.map((o) => `<li><span>${esc(nome(o))}</span><strong>${o.n ?? o.periodo}</strong><i style="width:${((o.n ?? o.periodo) / (itens[0].n ?? itens[0].periodo)) * 100}%"></i></li>`).join("")}</ul>`
        : '<p class="adm-vazio">Ainda nada no período.</p>';
    const v = r.visitas;
    const rotuloPeriodo = `${dataBr(r.de)} a ${dataBr(r.ate)}`;
    conteudo.innerHTML = `
        <div class="adm-cabeca"><h1>Painel<small>Quantas pessoas visitaram a loja e quantos pedidos foram para o WhatsApp. Suas próprias visitas (logada no painel) não contam.</small></h1>
            <div class="adm-acoes"><a class="adm-botao adm-botao--principal" href="#/produtos/novo">+ Novo produto</a></div></div>
        <div class="adm-cartoes">
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Produtos à venda</p><p class="adm-cartao__valor">${r.contagem.a_venda}</p><p class="adm-cartao__nota">${r.contagem.esgotados} esgotados · ${r.contagem.todos} no total</p></div>
        </div>
        <section class="adm-bloco adm-periodo">
            <label class="campo">Período
                <select id="periodo">${Object.entries(PERIODOS).map(([k, t]) => `<option value="${k}" ${periodoPainel.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
            <div class="adm-periodo__datas" ${periodoPainel.tipo === "outro" ? "" : "hidden"}>
                <label class="campo">De <input type="date" id="periodo-de" value="${r.de}"></label>
                <label class="campo">Até <input type="date" id="periodo-ate" value="${r.ate}"></label>
            </div>
        </section>
        <h2 class="adm-titulo-secao">Pedidos pelo WhatsApp</h2>
        <div class="adm-cartoes">
            <div class="adm-cartao adm-cartao--verde"><p class="adm-cartao__rotulo">Pedidos no período</p><p class="adm-cartao__valor">${r.periodo}</p><p class="adm-cartao__nota">${rotuloPeriodo}</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Pedidos hoje</p><p class="adm-cartao__valor">${r.hoje}</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Desde o começo</p><p class="adm-cartao__valor">${r.total}</p></div>
        </div>
        <div class="adm-duas">
            <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>Mais pedidos</h2></div>${barras(r.produtos, (p) => p.nome)}</section>
            <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>Pedidos por dia</h2></div>${grafico(serie(r.dias), "Pedidos")}</section>
        </div>
        <p class="adm-form__dica">Cada pessoa conta 1 pedido por produto por dia, quando toca em "Pedir" ou envia a sacola. A venda em si é combinada no WhatsApp.</p>
        <h2 class="adm-titulo-secao">Visitas ao site</h2>
        <div class="adm-cartoes">
            <div class="adm-cartao adm-cartao--verde"><p class="adm-cartao__rotulo">Visitas no período</p><p class="adm-cartao__valor">${v.visitas}</p><p class="adm-cartao__nota">páginas abertas</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Pessoas no período</p><p class="adm-cartao__valor">${v.pessoas}</p><p class="adm-cartao__nota">soma das pessoas diferentes de cada dia</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Visitas hoje</p><p class="adm-cartao__valor">${v.visitas_hoje}</p><p class="adm-cartao__nota">${v.pessoas_hoje} ${v.pessoas_hoje === 1 ? "pessoa" : "pessoas"}</p></div>
        </div>
        <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>Visitas por dia</h2></div>${grafico(serie(v.dias), "Visitas")}</section>
        <div class="adm-duas">
            <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>De onde vieram</h2></div>${barras(v.origens, (o) => o.origem)}</section>
            <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>Páginas mais vistas</h2></div>${barras(v.paginas, (p) => NOMES_PAGINAS[p.pagina] || p.pagina.replace(/^\/produto\/(.+)\/$/, "Produto: $1"))}</section>
        </div>`;
    document.getElementById("periodo").addEventListener("change", (e) => {
        periodoPainel = { ...periodoPainel, tipo: e.target.value };
        if (e.target.value === "outro") { periodoPainel.de = r.de; periodoPainel.ate = r.ate; conteudo.querySelector(".adm-periodo__datas").hidden = false; return; }
        paginaPainel().catch(() => {});
    });
    ["periodo-de", "periodo-ate"].forEach((id) => document.getElementById(id).addEventListener("change", () => {
        const de2 = document.getElementById("periodo-de").value, ate2 = document.getElementById("periodo-ate").value;
        if (!de2 || !ate2) return;
        periodoPainel = { tipo: "outro", de: de2, ate: ate2 };
        paginaPainel().catch(() => {});
    }));
}

// ---------- Produtos ----------

let filtroProdutos = "";

async function paginaProdutos(mensagem = "", tipo = "ok") {
    titulo.textContent = "Produtos";
    const { produtos, moeda } = await api("/api/admin/produtos");
    moedaLoja = moeda;
    conteudo.innerHTML = `
        ${aviso(mensagem, tipo)}
        <div class="adm-cabeca"><h1>Produtos<small>Aparecem no catálogo nesta ordem. Os botões rápidos mudam na hora: <b>Esgotado</b>, <b>Destaque</b> e <b>No site</b>.</small></h1>
            <div class="adm-acoes"><a class="adm-botao adm-botao--principal" href="#/produtos/novo">+ Novo produto</a></div></div>
        <section class="adm-bloco">
            ${produtos.length ? `<div class="adm-bloco__cabeca"><input type="search" class="adm-busca" id="filtro" placeholder="Procurar produto…" value="${esc(filtroProdutos)}"></div>
            <table class="adm-tabela adm-tabela--aulas">
                <thead><tr><th>Ordem</th><th>Produto</th><th>Preço</th><th>Pedidos (30 dias)</th><th>Situação</th><th></th></tr></thead><tbody>
                ${produtos.map((p, i) => `<tr data-produto="${p.id}" data-busca="${esc(`${p.nome} ${p.categoria}`.toLowerCase())}" tabindex="0">
                    <td class="adm-ordem"><button type="button" class="adm-mini adm-mini--neutro" data-mover="-1" aria-label="Subir ${esc(p.nome)}" ${i ? "" : "disabled"}>↑</button><button type="button" class="adm-mini adm-mini--neutro" data-mover="1" aria-label="Descer ${esc(p.nome)}" ${i < produtos.length - 1 ? "" : "disabled"}>↓</button></td>
                    <td data-rotulo="Produto"><div class="adm-post">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : '<span class="adm-post__sem"></span>'}<span><strong>${esc(p.nome)}</strong><small>${esc(p.categoria || "Sem categoria")}</small></span></div></td>
                    <td data-rotulo="Preço" class="adm-preco">${p.preco_antigo > p.preco ? `<s>${dinheiro(p.preco_antigo)}</s>` : ""}${p.preco ? dinheiro(p.preco) : "Consulte"}</td>
                    <td data-rotulo="Pedidos">${p.pedidos30}</td>
                    <td><div class="adm-rapidos">
                        <button type="button" class="adm-mini adm-mini--neutro ${p.esgotado ? "ligado" : ""}" data-rapido="esgotado" aria-pressed="${Boolean(p.esgotado)}">Esgotado</button>
                        <button type="button" class="adm-mini adm-mini--neutro ${p.destaque ? "ligado" : ""}" data-rapido="destaque" aria-pressed="${Boolean(p.destaque)}">Destaque</button>
                        <button type="button" class="adm-mini adm-mini--neutro ${p.ativo ? "ligado" : ""}" data-rapido="ativo" aria-pressed="${Boolean(p.ativo)}">No site</button>
                    </div></td>
                    <td class="adm-seta" aria-hidden="true">→</td></tr>`).join("")}
                </tbody></table>` : '<p class="adm-vazio">Nenhum produto ainda. Toque em "Novo produto" e cadastre o primeiro: foto, nome e preço já bastam.</p>'}
        </section>`;
    const filtrar = () => {
        const t = filtroProdutos.toLowerCase().trim();
        conteudo.querySelectorAll("tr[data-produto]").forEach((tr) => { tr.hidden = Boolean(t) && !tr.dataset.busca.includes(t); });
    };
    document.getElementById("filtro")?.addEventListener("input", (e) => { filtroProdutos = e.target.value; filtrar(); });
    filtrar();
    conteudo.querySelectorAll("tr[data-produto]").forEach((tr) => {
        const abrir = () => { location.hash = `#/produtos/${tr.dataset.produto}`; };
        tr.addEventListener("click", (e) => { if (!e.target.closest("button")) abrir(); });
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === tr) abrir(); });
    });
    conteudo.querySelectorAll("[data-rapido]").forEach((botao) => botao.addEventListener("click", async () => {
        const id = botao.closest("tr").dataset.produto;
        const ligado = botao.getAttribute("aria-pressed") !== "true";
        botao.disabled = true;
        try {
            await api(`/api/admin/produtos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [botao.dataset.rapido]: ligado }) });
            botao.setAttribute("aria-pressed", String(ligado));
            botao.classList.toggle("ligado", ligado);
        } catch (falha) {
            alert(falha.message);
        }
        botao.disabled = false;
    }));
    conteudo.querySelectorAll("[data-mover]").forEach((botao) => botao.addEventListener("click", async () => {
        const ids = produtos.map((p) => p.id);
        const i = ids.indexOf(Number(botao.closest("tr").dataset.produto));
        const j = i + Number(botao.dataset.mover);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try {
            await api("/api/admin/produtos/ordem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
            await paginaProdutos();
            conteudo.querySelector(`tr[data-produto="${ids[j]}"] [data-mover="${botao.dataset.mover}"]`)?.focus();
        } catch (falha) {
            alert(falha.message);
        }
    }));
}

async function paginaProdutoForm(id, mensagem = "", tipo = "ok") {
    const novo = id === "novo";
    const [{ categorias, moeda }, p] = await Promise.all([
        api("/api/admin/produtos"),
        novo ? Promise.resolve({ nome: "", slug: "", categoria: "", descricao: "", preco: 0, preco_antigo: 0, foto: "", destaque: 0, esgotado: 0, ativo: 1 }) : api(`/api/admin/produtos/${id}`),
    ]);
    moedaLoja = moeda;
    titulo.textContent = novo ? "Novo produto" : p.nome;
    const simbolo = moeda === "EUR" ? "€" : "R$";
    const opcoes = [...new Set([...categorias, p.categoria].filter(Boolean))];
    conteudo.innerHTML = `
        ${aviso(mensagem, tipo)}
        <div class="adm-cabeca"><h1>${novo ? "Novo produto" : esc(p.nome)}<small>${novo ? "Foto, nome e preço já bastam. O resto é opcional." : `<a href="/produto/${esc(p.slug)}/" target="_blank" rel="noopener">Ver no site</a>`}</small></h1>
            <div class="adm-acoes"><a class="adm-botao" href="#/produtos">${ICONES.voltar}Produtos</a></div></div>
        <form class="adm-bloco adm-form" id="form-produto" novalidate>
            <div class="campo">Foto <span class="adm-form__dica">quadrada fica melhor; pode tirar na hora com o celular</span>
                <div class="adm-capa adm-foto-produto">
                    <img id="foto-previa" alt="" ${p.foto ? `src="${esc(p.foto)}"` : "hidden"}>
                    <div class="adm-capa__acoes">
                        <label class="adm-botao">${p.foto ? "Trocar foto" : "Enviar foto"}<input type="file" accept="image/*" id="foto-arquivo" hidden></label>
                        ${p.foto ? '<button type="button" class="adm-botao" id="tirar-foto">Tirar foto</button>' : ""}
                        <span class="adm-form__dica" id="foto-status" role="status"></span>
                    </div>
                </div>
            </div>
            <label class="campo">Nome<input name="nome" maxlength="100" required value="${esc(p.nome)}" placeholder="Ex.: Kit Perfume Floral 100 ml + hidratante"></label>
            <div class="adm-duas-colunas">
                <label class="campo">Preço (${simbolo}) <span class="adm-form__dica">em branco: "Consulte o preço"</span><input name="preco" inputmode="decimal" value="${precoCampo(p.preco)}" placeholder="89,90"></label>
                <label class="campo">Preço "de" (${simbolo}) <span class="adm-form__dica">só em promoção: o preço antigo, riscado</span><input name="preco_antigo" inputmode="decimal" value="${precoCampo(p.preco_antigo)}" placeholder="119,90"></label>
            </div>
            <label class="campo">Categoria <span class="adm-form__dica">para escrever uma nova, mude a lista em "Dados da loja"</span>
                <select name="categoria"><option value="">Sem categoria</option>${opcoes.map((c) => `<option ${c === p.categoria ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
            <label class="campo">Descrição <span class="adm-form__dica">opcional: tamanho, fragrância, o que vem no kit…</span><textarea name="descricao" maxlength="1500">${esc(p.descricao)}</textarea></label>
            <fieldset class="adm-marcas"><legend>Situação</legend>
                <label class="adm-check"><input type="checkbox" name="ativo" ${p.ativo ? "checked" : ""}> Mostrar no site</label>
                <label class="adm-check"><input type="checkbox" name="destaque" ${p.destaque ? "checked" : ""}> Destaque na página inicial</label>
                <label class="adm-check"><input type="checkbox" name="esgotado" ${p.esgotado ? "checked" : ""}> Esgotado (aparece com "Avise quando chegar")</label>
            </fieldset>
            <label class="campo">Endereço da página <span class="adm-form__dica">sai sozinho do nome</span><input name="slug" maxlength="80" value="${esc(p.slug)}" pattern="[a-z0-9-]+"></label>
            <p class="conta__erro" id="erro" role="alert" hidden></p>
            <div class="adm-form__acoes">
                <button type="submit" class="adm-botao adm-botao--principal">${novo ? "Cadastrar produto" : "Salvar"}</button>
                ${novo ? "" : `<button type="button" class="adm-botao adm-botao--perigo" id="apagar">${ICONES.lixo}Apagar</button>`}
            </div>
        </form>`;
    const form = document.getElementById("form-produto");
    let foto = p.foto;
    let sujo = false;
    let slugManual = !novo;
    form.addEventListener("input", () => { sujo = true; });
    formularioSujo = () => sujo;
    form.nome.addEventListener("input", () => { if (!slugManual) form.slug.value = slugDe(form.nome.value); });
    form.slug.addEventListener("input", () => { slugManual = true; });
    document.getElementById("foto-arquivo").addEventListener("change", async (e) => {
        const arquivo = e.target.files[0];
        e.target.value = "";
        if (!arquivo) return;
        const status = document.getElementById("foto-status");
        status.textContent = "Enviando…";
        try {
            foto = await enviarImagem(arquivo, 1200);
            const img = document.getElementById("foto-previa");
            img.src = foto;
            img.hidden = false;
            status.textContent = "Foto enviada. Salve para aplicar.";
            sujo = true;
        } catch (falha) {
            status.textContent = falha.message;
        }
    });
    document.getElementById("tirar-foto")?.addEventListener("click", () => {
        foto = "";
        document.getElementById("foto-previa").hidden = true;
        document.getElementById("foto-status").textContent = "Foto retirada. Salve para aplicar.";
        sujo = true;
    });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const erro = document.getElementById("erro");
        erro.hidden = true;
        if (!form.slug.value) form.slug.value = slugDe(form.nome.value);
        const corpo = {
            nome: form.nome.value, slug: form.slug.value, categoria: form.categoria.value, descricao: form.descricao.value,
            preco: form.preco.value, preco_antigo: form.preco_antigo.value, foto,
            ativo: form.ativo.checked, destaque: form.destaque.checked, esgotado: form.esgotado.checked,
        };
        try {
            const r = await api(novo ? "/api/admin/produtos" : `/api/admin/produtos/${id}`, { method: novo ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            sujo = false;
            if (novo) { avisoPendente = `"${corpo.nome}" cadastrado. Já está no site.`; location.hash = `#/produtos/${r.id}`; }
            else await paginaProdutoForm(id, "Salvo. O site já está atualizado.", "ok");
        } catch (falha) {
            erro.textContent = falha.message;
            erro.hidden = false;
        }
    });
    document.getElementById("apagar")?.addEventListener("click", async () => {
        if (!confirm(`Apagar "${p.nome}"? Os pedidos contados dele também são apagados. Para só esconder do site, desmarque "Mostrar no site".`)) return;
        try {
            await api(`/api/admin/produtos/${id}`, { method: "DELETE" });
            sujo = false;
            location.hash = "#/produtos";
        } catch (falha) {
            alert(falha.message);
        }
    });
}

// ---------- Dados da loja ----------

async function paginaLoja(mensagem = "", tipo = "ok") {
    titulo.textContent = "Dados da loja";
    const a = await api("/api/admin/ajustes");
    const campo = (nome, rotulo, dica = "", extra = "") => `<label class="campo">${rotulo}${dica ? ` <span class="adm-form__dica">${dica}</span>` : ""}
                <input name="${nome}" value="${esc(a[nome])}" ${extra}></label>`;
    const area = (nome, rotulo, dica = "", max = 400) => `<label class="campo">${rotulo}${dica ? ` <span class="adm-form__dica">${dica}</span>` : ""}
                <textarea name="${nome}" class="adm-form__curto" maxlength="${max}">${esc(a[nome])}</textarea></label>`;
    conteudo.innerHTML = `
        ${aviso(mensagem, tipo)}
        <div class="adm-cabeca"><h1>Dados da loja<small>O WhatsApp que recebe os pedidos, os textos da página inicial e as categorias.</small></h1></div>
        <form class="adm-bloco adm-form" id="form-loja" novalidate>
            ${campo("whatsapp", "WhatsApp que recebe os pedidos", "com o código do país e o DDD, ex.: 55 11 91234-5678", 'inputmode="tel" maxlength="20" placeholder="55 11 91234-5678"')}
            <div class="campo">Foto <span class="adm-form__dica">aparece redonda no topo da página</span>
                <div class="adm-capa">
                    <img id="foto-previa" class="adm-logo" alt="" ${a.foto ? `src="${esc(a.foto)}"` : "hidden"}>
                    <div class="adm-capa__acoes">
                        <label class="adm-botao">${a.foto ? "Trocar foto" : "Enviar foto"}<input type="file" accept="image/*" id="foto-arquivo" hidden></label>
                        <span class="adm-form__dica" id="foto-status" role="status"></span>
                    </div>
                </div>
            </div>
            <div class="adm-duas-colunas">
                ${campo("nome", "Nome da loja", "", 'maxlength="40" required')}
                ${campo("cidade", "Cidade", "opcional", 'maxlength="60"')}
            </div>
            ${campo("slogan", "Frase de baixo do nome", "até 80 caracteres", 'maxlength="80"')}
            ${area("apresentacao", "Apresentação", "o texto do topo da página inicial")}
            ${area("entrega", "Entrega", "aparece em \"Como comprar\" e em cada produto", 300)}
            ${campo("pagamento", "Formas de pagamento", "", 'maxlength="160"')}
            ${area("categorias", "Categorias", "uma por linha, na ordem dos filtros do catálogo", 900)}
            <label class="campo">Moeda <select name="moeda"><option value="BRL" ${a.moeda !== "EUR" ? "selected" : ""}>Real (R$)</option><option value="EUR" ${a.moeda === "EUR" ? "selected" : ""}>Euro (€)</option></select></label>
            <h3 class="adm-form__titulo">Redes sociais <span class="adm-form__dica">cole o link completo do perfil; em branco, o ícone some</span></h3>
            ${campo("instagram", "Instagram", "", 'inputmode="url" placeholder="https://www.instagram.com/..."')}
            ${campo("facebook", "Facebook", "", 'inputmode="url" placeholder="https://www.facebook.com/..."')}
            ${campo("email", "E-mail de contato", "opcional", 'type="email" maxlength="120"')}
            <p class="conta__erro" id="erro" role="alert" hidden></p>
            <div class="adm-form__acoes"><button type="submit" class="adm-botao adm-botao--principal">Salvar</button></div>
        </form>`;
    const form = document.getElementById("form-loja");
    let foto = a.foto;
    let sujo = false;
    form.addEventListener("input", () => { sujo = true; });
    formularioSujo = () => sujo;
    document.getElementById("foto-arquivo").addEventListener("change", async (e) => {
        const arquivo = e.target.files[0];
        e.target.value = "";
        if (!arquivo) return;
        const status = document.getElementById("foto-status");
        status.textContent = "Enviando…";
        try {
            foto = await enviarImagem(arquivo, 600);
            const img = document.getElementById("foto-previa");
            img.src = foto;
            img.hidden = false;
            status.textContent = "Foto enviada. Salve para aplicar.";
            sujo = true;
        } catch (falha) {
            status.textContent = falha.message;
        }
    });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const erro = document.getElementById("erro");
        erro.hidden = true;
        try {
            const corpo = Object.fromEntries([...form.querySelectorAll("[name]")].map((i) => [i.name, i.value]));
            corpo.foto = foto;
            await api("/api/admin/ajustes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            sujo = false;
            await paginaLoja("Salvo. O site já está atualizado.", "ok");
        } catch (falha) {
            erro.textContent = falha.message;
            erro.hidden = false;
        }
    });
}

// ---------- Navegação ----------

let formularioSujo = null;
let avisoPendente = "";
let hashAtual = location.hash;

async function mostrar() {
    if (formularioSujo?.() && location.hash !== hashAtual && !confirm("Sair sem salvar? As mudanças vão se perder.")) {
        history.replaceState(null, "", hashAtual || "#/");
        return;
    }
    formularioSujo = null;
    hashAtual = location.hash;
    const caminho = location.hash.replace(/^#/, "") || "/";
    const produto = /^\/produtos\/(novo|\d+)$/.exec(caminho);
    const pagina = caminho === "/produtos/novo" ? "novo" : caminho.startsWith("/produtos") ? "produtos" : caminho.startsWith("/loja") ? "loja" : "painel";
    document.querySelectorAll(".adm-menu__nav a[data-pagina]").forEach((a) => a.classList.toggle("ativo", a.dataset.pagina === pagina));
    abrirMenu(false);
    try {
        if (produto) { const msg = avisoPendente; avisoPendente = ""; await paginaProdutoForm(produto[1], msg, "ok"); }
        else if (caminho === "/produtos") await paginaProdutos();
        else if (caminho === "/loja") await paginaLoja();
        else await paginaPainel();
        scrollTo(0, 0);
    } catch (falha) {
        conteudo.innerHTML = aviso(falha.message, "erro") + '<a class="adm-botao" href="#/">Voltar ao painel</a>';
    }
}

function abrirMenu(aberto) {
    document.getElementById("menu").classList.toggle("aberto", aberto);
    document.getElementById("veu").hidden = !aberto;
    document.getElementById("abrir-menu").setAttribute("aria-expanded", aberto);
}
document.getElementById("abrir-menu").addEventListener("click", () => abrirMenu(true));
document.getElementById("veu").addEventListener("click", () => abrirMenu(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrirMenu(false); });

document.getElementById("sair").addEventListener("click", async () => {
    await fetch("/api/conta/sair", { method: "POST" });
    location.href = "/";
});

(async () => {
    try {
        const eu = await api("/api/admin/eu");
        for (const id of ["menu-avatar", "barra-avatar"]) document.getElementById(id).textContent = iniciais(eu.nome);
        document.getElementById("menu-nome").textContent = eu.nome;
        document.getElementById("menu-email").textContent = eu.email;
        document.getElementById("barra-nome").textContent = eu.nome.split(" ")[0];
    } catch (falha) {
        if (falha.status === 403) {
            document.querySelector(".adm-area").hidden = true;
            document.getElementById("menu").hidden = true;
            document.getElementById("negado").hidden = false;
            document.body.classList.replace("adm-corpo", "conta-pagina");
        }
        return;
    }
    addEventListener("hashchange", mostrar);
    addEventListener("beforeunload", (e) => { if (formularioSujo?.()) { e.preventDefault(); e.returnValue = ""; } });
    await mostrar();
})();
