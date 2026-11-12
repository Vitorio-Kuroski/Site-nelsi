// Painel da loja da Nelsi: Painel (pedidos e relatório de estoque), Produtos e Dados da loja.
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
async function reduzirImagem(arquivo, maximo = 1600, transparente = false) {
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
    if (!transparente) { // fotos: fundo branco; logo: mantém o fundo transparente
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, tela.width, tela.height);
    }
    ctx.drawImage(bitmap, 0, 0, tela.width, tela.height);
    const gerar = (tipo, qualidade) => new Promise((ok) => tela.toBlob(ok, tipo, qualidade));
    let blob = await gerar("image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") blob = await gerar(transparente ? "image/png" : "image/jpeg", 0.85);
    return blob;
}

async function enviarImagem(arquivo, maximo = 1600, transparente = false) {
    const blob = await reduzirImagem(arquivo, maximo, transparente);
    const r = await api("/api/admin/imagens", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    return r.url;
}

// ---------- Painel (pedidos e relatório) ----------

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
    const rotuloPeriodo = `${dataBr(r.de)} a ${dataBr(r.ate)}`;
    conteudo.innerHTML = `
        <div class="adm-cabeca"><h1>Painel<small>Quantos pedidos foram para o WhatsApp e o que repor. Seus próprios testes (logada no painel) não contam.</small></h1>
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
        <div class="adm-cartoes">
            <div class="adm-cartao adm-cartao--verde"><p class="adm-cartao__rotulo">Pedidos no período</p><p class="adm-cartao__valor">${r.periodo}</p><p class="adm-cartao__nota">${rotuloPeriodo}</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Pedidos hoje</p><p class="adm-cartao__valor">${r.hoje}</p></div>
            <div class="adm-cartao"><p class="adm-cartao__rotulo">Desde o começo</p><p class="adm-cartao__valor">${r.total}</p></div>
        </div>
        <section class="adm-bloco"><div class="adm-bloco__cabeca"><h2>Pedidos por dia</h2></div>${grafico(serie(r.dias), "Pedidos")}</section>
        <p class="adm-form__dica">Cada pessoa conta 1 pedido por produto por dia, quando toca em "Pedir" ou envia a sacola. A venda em si é combinada no WhatsApp.</p>
        <section class="adm-bloco adm-relatorio">
            <div class="adm-bloco__cabeca"><h2>Relatório para repor o estoque</h2><button type="button" class="adm-botao" id="copiar-relatorio">Copiar relatório</button></div>
            <p class="adm-form__dica adm-relatorio__dica">${rotuloPeriodo}. Para o fechamento do mês, escolha "Mês passado" no período.</p>
            <div class="adm-duas adm-relatorio__listas">
                <div><h3>Mais pedidos</h3>${r.produtos.length ? `<ol class="adm-lista">${r.produtos.map((p) => `<li><span>${esc(p.nome)}${p.esgotado ? ' <span class="adm-selo adm-selo--cinza">Esgotado</span>' : ""}</span><strong>${p.periodo}</strong></li>`).join("")}</ol>` : '<p class="adm-vazio">Nenhum pedido no período.</p>'}</div>
                <div><h3>Nenhum pedido no período (${r.sem_pedidos.length})</h3>${r.sem_pedidos.length ? `<ul class="adm-lista">${r.sem_pedidos.map((p) => `<li><a href="#/produtos/${p.id}">${esc(p.nome)}</a><small>${esc(p.categoria || "")}</small></li>`).join("")}</ul>` : '<p class="adm-vazio">Todos os produtos tiveram pedido. 🎉</p>'}</div>
            </div>
        </section>`;
    document.getElementById("copiar-relatorio").addEventListener("click", async (e) => {
        const texto = `Relatório da loja · ${rotuloPeriodo}\n\nMais pedidos:\n${r.produtos.map((p, i) => `${i + 1}. ${p.nome}: ${p.periodo}${p.esgotado ? " (esgotado)" : ""}`).join("\n") || "nenhum"}\n\nNenhum pedido no período:\n${r.sem_pedidos.map((p) => `- ${p.nome}`).join("\n") || "nenhum"}`;
        const botao = e.currentTarget;
        try { await navigator.clipboard.writeText(texto); botao.textContent = "Copiado ✓"; setTimeout(() => { botao.textContent = "Copiar relatório"; }, 1800); }
        catch { prompt("Copie o texto:", texto); }
    });
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
            <div class="adm-acoes"><a class="adm-botao" href="#/produtos/lote">Cadastro rápido (várias fotos)</a><a class="adm-botao adm-botao--principal" href="#/produtos/novo">+ Novo produto</a></div></div>
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

// ---------- Cadastro rápido (várias fotos de uma vez) ----------

async function paginaLote() {
    titulo.textContent = "Cadastro rápido";
    const { categorias, moeda } = await api("/api/admin/produtos");
    moedaLoja = moeda;
    const simbolo = moeda === "EUR" ? "€" : "R$";
    const itens = []; // { id, foto, status, erro }
    let seq = 0;
    conteudo.innerHTML = `
        <div class="adm-cabeca"><h1>Cadastro rápido<small>Escolha várias fotos de uma vez. Depois é só escrever o nome e o preço de cada produto e cadastrar todos juntos.</small></h1>
            <div class="adm-acoes"><a class="adm-botao" href="#/produtos">${ICONES.voltar}Produtos</a></div></div>
        <section class="adm-bloco adm-form">
            <div class="adm-lote__topo">
                <label class="adm-botao adm-botao--principal adm-lote__escolher">Escolher fotos<input type="file" accept="image/*" multiple id="fotos" hidden></label>
                <label class="campo">Categoria para as próximas fotos
                    <select id="cat-padrao"><option value="">Sem categoria</option>${categorias.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
            </div>
            <p class="adm-form__dica" id="lote-status" role="status">No celular, dá para escolher várias fotos da galeria de uma vez.</p>
        </section>
        <div class="adm-lote" id="lote"></div>
        <div class="adm-lote__rodape" id="lote-rodape" hidden>
            <button type="button" class="adm-botao adm-botao--principal" id="cadastrar"></button>
            <span class="adm-form__dica" id="cadastrar-status" role="status"></span>
        </div>`;
    const lista = document.getElementById("lote");
    const status = document.getElementById("lote-status");
    const pendentes = () => itens.filter((i) => i.status !== "salvo");
    formularioSujo = () => pendentes().some((i) => i.foto);
    const atualizarRodape = () => {
        const n = pendentes().filter((i) => i.foto).length;
        document.getElementById("lote-rodape").hidden = n === 0;
        document.getElementById("cadastrar").textContent = `Cadastrar ${n} ${n === 1 ? "produto" : "produtos"}`;
    };
    const cartao = (i) => `
        <article class="adm-lote__item" data-item="${i.id}">
            <img src="${esc(i.foto)}" alt="">
            <div class="adm-lote__campos">
                <label class="campo">Nome<input data-c="nome" maxlength="100" placeholder="Nome do produto"></label>
                <div class="adm-duas-colunas">
                    <label class="campo">Preço (${simbolo})<input data-c="preco" inputmode="decimal" placeholder="89,90"></label>
                    <label class="campo">Categoria<select data-c="categoria"><option value="">Sem categoria</option>${categorias.map((c) => `<option ${c === i.categoria ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
                </div>
                <p class="conta__erro" data-erro hidden></p>
            </div>
            <button type="button" class="adm-mini adm-mini--neutro adm-lote__tirar" data-tirar aria-label="Tirar esta foto">✕</button>
        </article>`;

    document.getElementById("fotos").addEventListener("change", async (e) => {
        const arquivos = [...e.target.files];
        e.target.value = "";
        const categoria = document.getElementById("cat-padrao").value;
        let n = 0;
        for (const arquivo of arquivos) {
            n++;
            status.textContent = `Enviando foto ${n} de ${arquivos.length}…`;
            try {
                const item = { id: ++seq, foto: await enviarImagem(arquivo, 1200), categoria, status: "novo" };
                itens.push(item);
                lista.insertAdjacentHTML("beforeend", cartao(item));
                atualizarRodape();
            } catch (falha) {
                status.textContent = `Foto ${n}: ${falha.message}`;
                await new Promise((ok) => setTimeout(ok, 1200));
            }
        }
        status.textContent = `${arquivos.length} ${arquivos.length === 1 ? "foto enviada" : "fotos enviadas"}. Agora escreva o nome e o preço de cada uma.`;
        lista.querySelector(".adm-lote__item:not(.salvo) [data-c=nome]")?.focus();
    });

    lista.addEventListener("click", (e) => {
        const b = e.target.closest("[data-tirar]");
        if (!b) return;
        const art = b.closest("[data-item]");
        const i = itens.find((x) => x.id === Number(art.dataset.item));
        i.status = "salvo"; i.foto = "";
        art.remove();
        atualizarRodape();
    });

    document.getElementById("cadastrar").addEventListener("click", async (e) => {
        const botao = e.currentTarget;
        const st = document.getElementById("cadastrar-status");
        botao.disabled = true;
        let ok = 0, falhas = 0;
        for (const i of pendentes().filter((x) => x.foto)) {
            const art = lista.querySelector(`[data-item="${i.id}"]`);
            const erro = art.querySelector("[data-erro]");
            const v = (c) => art.querySelector(`[data-c=${c}]`).value;
            erro.hidden = true;
            if (!v("nome").trim()) { erro.textContent = "Falta o nome."; erro.hidden = false; falhas++; continue; }
            const base = slugDe(v("nome")) || "produto";
            let salvo = false;
            for (let tentativa = 1; tentativa <= 9 && !salvo; tentativa++) {
                const corpo = { nome: v("nome"), slug: tentativa === 1 ? base : `${base}-${tentativa}`, preco: v("preco"), categoria: v("categoria"), foto: i.foto, ativo: true };
                try {
                    await api("/api/admin/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
                    salvo = true;
                } catch (falha) {
                    if (falha.status === 409) continue;
                    erro.textContent = falha.message; erro.hidden = false; break;
                }
            }
            if (salvo) { ok++; i.status = "salvo"; art.classList.add("salvo"); art.querySelectorAll("input, select, button").forEach((x) => { x.disabled = true; }); }
            else falhas++;
            st.textContent = `${ok} cadastrados…`;
        }
        botao.disabled = false;
        atualizarRodape();
        st.textContent = falhas ? `${ok} cadastrados. ${falhas} ${falhas === 1 ? "precisa" : "precisam"} de correção (veja em vermelho).` : `Pronto: ${ok} ${ok === 1 ? "produto cadastrado" : "produtos cadastrados"}. Já estão no site.`;
        if (!falhas && ok) lista.insertAdjacentHTML("afterend", '<p class="adm-aviso adm-aviso--ok" id="lote-fim">Tudo cadastrado. <a href="#/produtos">Ver a lista de produtos</a> ou escolha mais fotos acima.</p>');
    });
}

// ---------- Aparência ----------

const FUNDOS_TEMA = { vinho: "#FBF6F1", rosa: "#FFF7FA", lilas: "#FAF7FD", oliva: "#FAF8F1", preto: "#FBF8F3", marinho: "#F7F9FC",
    coral: "#FFF8F5", turquesa: "#F6FBFA", terracota: "#FCF7F2", nude: "#FCF8F6", vermelho: "#FFF8F7", ceu: "#F7FAFD" };
const FAMILIAS_FONTE = { elegante: "'Playfair Display', Georgia, serif", moderna: "'Poppins', system-ui, sans-serif", delicada: "'Dancing Script', cursive",
    classica: "'Cormorant Garamond', Georgia, serif", arredondada: "'Quicksand', system-ui, sans-serif", marcante: "'Abril Fatface', Georgia, serif" };
const ROTULOS_OPCOES = { foto_topo: "Foto do topo", foto_produto: "Fotos dos produtos", colunas_celular: "Produtos por linha no celular" };

async function paginaAparencia(mensagem = "", tipo = "ok") {
    titulo.textContent = "Aparência";
    const a = await api("/api/admin/aparencia");
    conteudo.innerHTML = `
        ${aviso(mensagem, tipo)}
        <div class="adm-cabeca"><h1>Aparência<small>Cores, letras, logo, faixa de aviso e o que aparece na página inicial. Se não gostar, "Voltar ao original" desfaz tudo.</small></h1>
            <div class="adm-acoes"><a class="adm-botao" href="/" target="_blank" rel="noopener">Ver o site</a></div></div>
        <form class="adm-bloco adm-form" id="form-aparencia" novalidate>
            <fieldset class="adm-escolhas"><legend>Cores</legend>
                ${Object.entries(a.temas).map(([k, t]) => `<label class="adm-escolha adm-escolha--tema">
                    <input type="radio" name="tema" value="${k}" ${a.tema === k ? "checked" : ""}>
                    <span class="adm-escolha__amostra" style="background:${FUNDOS_TEMA[k]}"><i style="background:${t.cor}"></i><b style="color:${t.cor}">Aa</b></span>
                    <span>${esc(t.nome)}</span></label>`).join("")}
            </fieldset>
            <fieldset class="adm-escolhas"><legend>Letras dos títulos</legend>
                ${Object.entries(a.fontes).map(([k, nome]) => `<label class="adm-escolha adm-escolha--fonte">
                    <input type="radio" name="fonte" value="${k}" ${a.fonte === k ? "checked" : ""}>
                    <span class="adm-escolha__amostra" style="font-family:${FAMILIAS_FONTE[k]}">${esc(a.nome)}</span>
                    <span>${esc(nome)}</span></label>`).join("")}
            </fieldset>
            ${Object.entries(a.opcoes).map(([campo, opcoes]) => `<fieldset class="adm-escolhas adm-escolhas--texto"><legend>${ROTULOS_OPCOES[campo]}</legend>
                ${Object.entries(opcoes).map(([k, nome]) => `<label class="adm-escolha"><input type="radio" name="${campo}" value="${k}" ${a[campo] === k ? "checked" : ""}><span>${esc(nome)}</span></label>`).join("")}
            </fieldset>`).join("")}
            <div class="campo">Logo <span class="adm-form__dica">sem logo, o topo mostra o nome da loja escrito; use imagem com fundo transparente ou branco</span>
                <div class="adm-capa">
                    <img id="logo-previa" class="adm-logo-loja" alt="" ${a.logo ? `src="${esc(a.logo)}"` : "hidden"}>
                    <div class="adm-capa__acoes">
                        <label class="adm-botao">${a.logo ? "Trocar logo" : "Enviar logo"}<input type="file" accept="image/*" id="logo-arquivo" hidden></label>
                        <button type="button" class="adm-botao" id="logo-tirar" ${a.logo ? "" : "hidden"}>Usar o nome escrito</button>
                        <span class="adm-form__dica" id="logo-status" role="status"></span>
                    </div>
                </div>
            </div>
            <h3 class="adm-form__titulo">Textos dos botões e títulos <span class="adm-form__dica">em branco, volta ao texto original</span></h3>
            <div class="adm-duas-colunas">
                ${Object.entries(a.textos).map(([k, t]) => `<label class="campo">${esc(t.rotulo)}<input name="${k}" maxlength="${t.max}" value="${esc(a[k] === a.padrao[k] ? "" : a[k])}" placeholder="${esc(a.padrao[k])}"></label>`).join("")}
            </div>
            <div class="campo">Ordem das seções da página inicial <span class="adm-form__dica">use as setas; o topo com a foto fica sempre em primeiro</span>
                <ol class="adm-ordem-secoes" id="ordem-secoes"></ol>
            </div>
            <h3 class="adm-form__titulo">Faixa de aviso no topo <span class="adm-form__dica">em branco, a faixa some</span></h3>
            <label class="campo">Texto<input name="banner_texto" maxlength="140" value="${esc(a.banner_texto)}" placeholder="Ex.: Promoção de Natal: kits com 20% off até dia 20!"></label>
            <label class="campo adm-form__data">Mostrar até <span class="adm-form__dica">opcional: no dia seguinte a faixa some sozinha</span><input type="date" name="banner_ate" value="${esc(a.banner_ate)}"></label>
            <fieldset class="adm-marcas"><legend>Seções da página inicial</legend>
                <label class="adm-check"><input type="checkbox" name="mostrar_destaques" ${a.mostrar_destaques === "1" ? "checked" : ""}> Destaques e promoções</label>
                <label class="adm-check"><input type="checkbox" name="mostrar_como_comprar" ${a.mostrar_como_comprar === "1" ? "checked" : ""}> Como comprar</label>
                <label class="adm-check"><input type="checkbox" name="mostrar_pagamento" ${a.mostrar_pagamento === "1" ? "checked" : ""}> Formas de pagamento</label>
            </fieldset>
            <p class="conta__erro" id="erro" role="alert" hidden></p>
            <div class="adm-form__acoes">
                <button type="submit" class="adm-botao adm-botao--principal">Salvar</button>
                <button type="button" class="adm-botao adm-botao--perigo" id="original">Voltar ao original</button>
            </div>
        </form>`;
    const form = document.getElementById("form-aparencia");
    let logo = a.logo;
    let ordem = [...a.ordem];
    const listaOrdem = document.getElementById("ordem-secoes");
    const desenharOrdem = () => {
        listaOrdem.innerHTML = ordem.map((k, i) => `<li><b>${i + 1}</b><span>${esc(a.secoes[k])}</span>
            <button type="button" class="adm-mini adm-mini--neutro" data-sobe="${i}" aria-label="Subir ${esc(a.secoes[k])}" ${i ? "" : "disabled"}>↑</button>
            <button type="button" class="adm-mini adm-mini--neutro" data-desce="${i}" aria-label="Descer ${esc(a.secoes[k])}" ${i < ordem.length - 1 ? "" : "disabled"}>↓</button></li>`).join("");
    };
    listaOrdem.addEventListener("click", (e) => {
        const b = e.target.closest("[data-sobe],[data-desce]");
        if (!b) return;
        const i = Number(b.dataset.sobe ?? b.dataset.desce), j = b.dataset.sobe !== undefined ? i - 1 : i + 1;
        [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
        sujo = true;
        desenharOrdem();
        listaOrdem.querySelector(`[data-${b.dataset.sobe !== undefined ? "sobe" : "desce"}="${j}"]`)?.focus();
    });
    desenharOrdem();
    let sujo = false;
    form.addEventListener("input", () => { sujo = true; });
    form.addEventListener("change", () => { sujo = true; });
    formularioSujo = () => sujo;
    const previa = document.getElementById("logo-previa");
    document.getElementById("logo-arquivo").addEventListener("change", async (e) => {
        const arquivo = e.target.files[0];
        e.target.value = "";
        if (!arquivo) return;
        const status = document.getElementById("logo-status");
        status.textContent = "Enviando…";
        try {
            logo = await enviarImagem(arquivo, 600, true);
            previa.src = logo; previa.hidden = false;
            document.getElementById("logo-tirar").hidden = false;
            status.textContent = "Logo enviado. Salve para aplicar.";
            sujo = true;
        } catch (falha) {
            status.textContent = falha.message;
        }
    });
    document.getElementById("logo-tirar").addEventListener("click", (e) => {
        logo = ""; previa.hidden = true; e.currentTarget.hidden = true;
        document.getElementById("logo-status").textContent = "O topo vai mostrar o nome escrito. Salve para aplicar.";
        sujo = true;
    });
    const salvar = async (corpo, msg) => {
        const erro = document.getElementById("erro");
        erro.hidden = true;
        try {
            await api("/api/admin/aparencia", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            sujo = false;
            await paginaAparencia(msg, "ok");
        } catch (falha) {
            erro.textContent = falha.message;
            erro.hidden = false;
        }
    };
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        salvar({
            tema: form.tema.value, fonte: form.fonte.value, logo,
            foto_topo: form.foto_topo.value, foto_produto: form.foto_produto.value, colunas_celular: form.colunas_celular.value,
            ...Object.fromEntries(Object.keys(a.textos).map((k) => [k, form[k].value])), ordem_secoes: ordem,
            banner_texto: form.banner_texto.value, banner_ate: form.banner_ate.value,
            mostrar_destaques: form.mostrar_destaques.checked, mostrar_como_comprar: form.mostrar_como_comprar.checked, mostrar_pagamento: form.mostrar_pagamento.checked,
        }, "Salvo. Abra o site para ver como ficou.");
    });
    document.getElementById("original").addEventListener("click", () => {
        if (!confirm("Voltar a aparência ao original? Cores, letras, fotos, textos dos botões, ordem das seções, logo e faixa de aviso voltam ao padrão. Produtos e textos da loja não mudam.")) return;
        salvar({ original: true }, "Pronto: a aparência voltou ao original.");
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
            ${area("entrega", "Onde atende", "aparece em \"Como comprar\" e em cada produto", 300)}
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
    const pagina = caminho === "/produtos/novo" ? "novo" : caminho === "/produtos/lote" ? "lote" : caminho.startsWith("/produtos") ? "produtos" : caminho.startsWith("/loja") ? "loja" : caminho.startsWith("/aparencia") ? "aparencia" : "painel";
    document.querySelectorAll(".adm-menu__nav a[data-pagina]").forEach((a) => a.classList.toggle("ativo", a.dataset.pagina === pagina));
    abrirMenu(false);
    try {
        if (produto) { const msg = avisoPendente; avisoPendente = ""; await paginaProdutoForm(produto[1], msg, "ok"); }
        else if (caminho === "/produtos/lote") await paginaLote();
        else if (caminho === "/produtos") await paginaProdutos();
        else if (caminho === "/loja") await paginaLoja();
        else if (caminho === "/aparencia") await paginaAparencia();
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
