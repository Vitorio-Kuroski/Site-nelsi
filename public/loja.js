// Loja da Nelsi: busca e filtros do catálogo, e a sacola (guardada só neste aparelho) que vira um pedido no WhatsApp.
(() => {
    const moeda = document.body.dataset.moeda === "EUR" ? "EUR" : "BRL";
    const formato = new Intl.NumberFormat(moeda === "EUR" ? "pt-PT" : "pt-BR", { style: "currency", currency: moeda });
    const temZap = document.body.dataset.zap === "1";

    // ---------- Busca e filtros ----------
    const lista = document.getElementById("produtos");
    if (lista) {
        const busca = document.getElementById("busca");
        const nada = document.getElementById("nada");
        let categoria = "";
        const sem = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const aplicar = () => {
            const termos = sem(busca?.value || "").split(/\s+/).filter(Boolean);
            let visiveis = 0;
            lista.querySelectorAll(".produto").forEach((p) => {
                const texto = sem(p.dataset.busca || "");
                const ok = (!categoria || p.dataset.categoria === categoria) && termos.every((t) => texto.includes(t));
                p.hidden = !ok;
                if (ok) visiveis++;
            });
            if (nada) nada.hidden = visiveis > 0;
        };
        busca?.addEventListener("input", aplicar);
        document.querySelectorAll(".filtro").forEach((b) => b.addEventListener("click", () => {
            categoria = b.dataset.filtro;
            document.querySelectorAll(".filtro").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
            aplicar();
        }));
    }

    // ---------- Sacola ----------
    const CHAVE = "sacola-nelsi";
    const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || "[]"); } catch { return []; } };
    const guardar = (itens) => { try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* sem armazenamento: a sacola vale só nesta página */ } };
    let itens = ler();

    const caixa = document.getElementById("sacola");
    const abrir = document.getElementById("sacola-abrir");
    const painel = document.getElementById("sacola-lista");
    const ul = document.getElementById("sacola-itens");
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

    function desenhar() {
        const qtd = itens.reduce((s, i) => s + i.qtd, 0);
        caixa.hidden = qtd === 0;
        document.body.classList.toggle("com-sacola", qtd > 0);
        if (!qtd) { painel.hidden = true; abrir.setAttribute("aria-expanded", "false"); }
        const total = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
        document.getElementById("sacola-resumo").textContent = `Sacola · ${qtd} ${qtd === 1 ? "item" : "itens"}`;
        document.getElementById("sacola-total").textContent = total ? formato.format(total / 100) : "";
        ul.innerHTML = itens.map((i, n) => `<li><span>${esc(i.nome)}<small>${i.preco ? formato.format(i.preco * i.qtd / 100) : "Consulte o preço"}</small></span>
            <span class="qtd"><button type="button" data-menos="${n}" aria-label="Tirar um">−</button><b>${i.qtd}</b><button type="button" data-mais="${n}" aria-label="Pôr mais um">+</button></span></li>`).join("");
        document.querySelectorAll("[data-sacola]").forEach((b) => b.classList.toggle("adicionado", itens.some((i) => i.slug === b.dataset.sacola)));
        document.getElementById("sacola-enviar").hidden = !temZap;
    }

    document.addEventListener("click", (e) => {
        const botao = e.target.closest("[data-sacola]");
        if (!botao) return;
        const atual = itens.find((i) => i.slug === botao.dataset.sacola);
        if (atual) atual.qtd = Math.min(99, atual.qtd + 1);
        else itens.push({ slug: botao.dataset.sacola, nome: botao.dataset.nome, preco: Number(botao.dataset.preco) || 0, qtd: 1 });
        guardar(itens);
        desenhar();
    });
    ul.addEventListener("click", (e) => {
        const menos = e.target.closest("[data-menos]"), mais = e.target.closest("[data-mais]");
        if (!menos && !mais) return;
        const i = itens[Number((menos || mais).dataset[menos ? "menos" : "mais"])];
        i.qtd += mais ? 1 : -1;
        itens = itens.filter((x) => x.qtd > 0);
        guardar(itens);
        desenhar();
    });
    abrir.addEventListener("click", () => {
        painel.hidden = !painel.hidden;
        abrir.setAttribute("aria-expanded", String(!painel.hidden));
    });
    document.getElementById("sacola-limpar").addEventListener("click", () => {
        if (!confirm("Esvaziar a sacola?")) return;
        itens = [];
        guardar(itens);
        desenhar();
    });
    document.getElementById("sacola-enviar").addEventListener("click", async (e) => {
        const botao = e.currentTarget;
        // Abre a aba antes da resposta, para o navegador do celular não bloquear
        const aba = window.open("", "_blank");
        botao.disabled = true;
        try {
            const r = await fetch("/api/sacola", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: itens.map(({ slug, qtd }) => ({ slug, qtd })) }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.erro || "Não deu certo. Tente de novo.");
            if (aba) aba.location.href = d.link; else location.href = d.link;
            if (d.removidos) alert("Alguns produtos saíram do catálogo ou esgotaram e ficaram de fora do pedido.");
        } catch (falha) {
            aba?.close();
            alert(falha.message);
        } finally {
            botao.disabled = false;
        }
    });
    addEventListener("storage", (e) => { if (e.key === CHAVE) { itens = ler(); desenhar(); } });
    desenhar();
})();
