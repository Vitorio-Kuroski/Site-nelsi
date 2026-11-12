// Cadastro, login e área do aluno: conversa com as rotas /api/conta/* do Worker (src/alunos.js).

// Para onde ir depois de entrar: o "?voltar=" (só caminhos deste site); se não houver,
// o administrador vai direto para o painel e o aluno para a área do aluno
function destinoDepoisDeEntrar(admin = false) {
    const voltar = new URLSearchParams(location.search).get("voltar") || "";
    if (/^\/(?![\/\\])/.test(voltar)) return voltar;
    return "/admin/";
}

// Leva o "?voltar=" para os links entre Entrar e Criar conta
document.querySelectorAll(".conta__troca a").forEach((a) => {
    const voltar = new URLSearchParams(location.search).get("voltar");
    if (voltar) a.href += "?voltar=" + encodeURIComponent(voltar);
});

// Formulários de entrar e de criar conta: deu certo, vai para a área do aluno (ou de volta ao curso)
function formularioConta(rota) {
    const form = document.getElementById("form");
    const erro = document.getElementById("erro");
    const botao = form.querySelector("button");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const texto = botao.textContent;
        botao.disabled = true;
        botao.textContent = "Aguarde...";
        erro.hidden = true;
        try {
            const resposta = await fetch(rota, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            const dados = await resposta.json().catch(() => ({}));
            if (!resposta.ok) throw new Error(dados.erro || "Não deu certo. Tente de novo.");
            location.href = destinoDepoisDeEntrar(dados.admin);
        } catch (falha) {
            erro.textContent = falha.message === "Failed to fetch" ? "Sem conexão. Tente de novo." : falha.message;
            erro.hidden = false;
            botao.disabled = false;
            botao.textContent = texto;
        }
    });
}

// Botão "aguarde" e mensagem de erro, comuns aos formulários abaixo
async function enviar(form, rota, corpo) {
    const erro = document.getElementById("erro");
    const botao = form.querySelector("button");
    const texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Aguarde...";
    erro.hidden = true;
    try {
        const resposta = await fetch(rota, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || "Não deu certo. Tente de novo.");
        return dados;
    } catch (falha) {
        erro.textContent = falha.message === "Failed to fetch" ? "Sem conexão. Tente de novo." : falha.message;
        erro.hidden = false;
        throw falha;
    } finally {
        botao.disabled = false;
        botao.textContent = texto;
    }
}

// Esqueci minha senha: pede o link e mostra a mesma mensagem, tendo conta ou não
function formularioEsqueci() {
    const form = document.getElementById("form");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        try {
            await enviar(form, "/api/conta/esqueci", { email: form.email.value });
            form.hidden = true;
            document.getElementById("ok").hidden = false;
        } catch {}
    });
}

// Senha nova: lê o código do link, tira-o do endereço e salva a senha
function formularioNovaSenha() {
    const form = document.getElementById("form");
    const token = new URLSearchParams(location.search).get("token") || "";
    history.replaceState(null, "", location.pathname);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        if (form.senha.value !== form.confirmar.value) {
            const erro = document.getElementById("erro");
            erro.textContent = "As duas senhas não são iguais.";
            erro.hidden = false;
            return;
        }
        try {
            await enviar(form, "/api/conta/nova-senha", { token, senha: form.senha.value });
            location.href = "/conta/";
        } catch {}
    });
}

// Área do aluno: cursos liberados
