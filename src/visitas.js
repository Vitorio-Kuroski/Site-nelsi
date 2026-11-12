// Visitas ao próprio site: quantas vezes cada página foi aberta, quantas pessoas diferentes
// e de onde vieram (Instagram, Google, TikTok…). Sem cookies e sem guardar IP: para contar
// pessoas diferentes no dia usamos um código embaralhado, apagado no dia seguinte.

const TABELAS = [
    `CREATE TABLE IF NOT EXISTS visitas (
        dia TEXT NOT NULL,
        pagina TEXT NOT NULL,
        origem TEXT NOT NULL,
        n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (dia, pagina, origem)
    )`,
    `CREATE TABLE IF NOT EXISTS visitantes (
        dia TEXT NOT NULL,
        codigo TEXT NOT NULL,
        PRIMARY KEY (dia, codigo)
    )`,
    `CREATE TABLE IF NOT EXISTS visitas_unicas (
        dia TEXT PRIMARY KEY,
        n INTEGER NOT NULL DEFAULT 0
    )`,
];

let prontas = false;
export async function garantirTabelasVisitas(db) {
    if (prontas) return;
    await db.batch(TABELAS.map((sql) => db.prepare(sql)));
    prontas = true;
}

const ROBOS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|curl|wget|python|headless|monitor/i;

// Só páginas de verdade, abertas por pessoas (não robôs, não o painel, não a própria Nelsi logada).
export function deveContar(request, resposta) {
    const url = new URL(request.url);
    if (request.method !== "GET" || resposta.status !== 200) return false;
    if (!(resposta.headers.get("Content-Type") || "").includes("text/html")) return false;
    if (/^\/(admin|conta|api|pedir|imagens)(\/|$)/.test(url.pathname)) return false;
    if (ROBOS.test(request.headers.get("User-Agent") || "")) return false;
    // Só navegação de navegador de verdade (programas e verificadores de link não mandam isso)
    const modo = request.headers.get("Sec-Fetch-Mode");
    if (modo ? modo !== "navigate" : !(request.headers.get("Accept") || "").includes("text/html")) return false;
    const proposito = `${request.headers.get("Sec-Purpose") || ""} ${request.headers.get("Purpose") || ""}`;
    if (/prefetch|prerender/i.test(proposito)) return false;
    if (/(^|;\s*)sessao=/.test(request.headers.get("Cookie") || "")) return false;
    return true;
}

function origemDa(request, url) {
    const ua = request.headers.get("User-Agent") || "";
    const utm = (url.searchParams.get("utm_source") || "").trim().toLowerCase();
    let ref = "";
    try { ref = new URL(request.headers.get("Referer") || "").hostname.replace(/^www\./, ""); } catch { /* sem referer */ }
    const tem = (re) => re.test(utm) || re.test(ref);
    if (ref && ref === url.hostname.replace(/^www\./, "")) return "";
    if (/Instagram/i.test(ua) || tem(/instagram/)) return "Instagram";
    if (/musical_ly|BytedanceWebview|TikTok/i.test(ua) || tem(/tiktok/)) return "TikTok";
    if (tem(/youtube|youtu\.be/)) return "YouTube";
    if (/FBAN|FBAV|FB_IAB/.test(ua) || tem(/facebook|fb\.com|^fb$/)) return "Facebook";
    if (tem(/whatsapp|wa\.me/)) return "WhatsApp";
    if (tem(/linktr\.ee|linktree/)) return "Linktree";
    if (tem(/google/)) return "Google";
    if (tem(/bing|duckduckgo|yahoo|ecosia/)) return "Outras buscas";
    if (utm) return utm.slice(0, 30);
    if (ref) return "Outros sites";
    return "Direto ou WhatsApp";
}

export async function contarVisita(request, env) {
    try {
        const db = env.DB;
        await garantirTabelasVisitas(db);
        const url = new URL(request.url);
        const pagina = (url.pathname.replace(/\/index\.html$/, "/") || "/").slice(0, 120);
        const origem = origemDa(request, url);
        const dia = new Date().toISOString().slice(0, 10);
        const ip = request.headers.get("CF-Connecting-IP") || "";
        const bytes = await crypto.subtle.digest("SHA-256",
            new TextEncoder().encode(`${ip}|${request.headers.get("User-Agent") || ""}|${dia}|visita`));
        const codigo = [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
        const [, novo] = await db.batch([
            db.prepare("INSERT INTO visitas (dia, pagina, origem, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, pagina, origem) DO UPDATE SET n = n + 1")
                .bind(dia, pagina, origem || "Dentro do site"),
            db.prepare("INSERT OR IGNORE INTO visitantes (dia, codigo) VALUES (?, ?)").bind(dia, codigo),
        ]);
        if (novo.meta?.changes) {
            await db.batch([
                db.prepare("INSERT INTO visitas_unicas (dia, n) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET n = n + 1").bind(dia),
                db.prepare("DELETE FROM visitantes WHERE dia < ?").bind(dia),
            ]);
        }
    } catch (erro) {
        console.error("Visita não contada", erro);
    }
}

// Resumo para o painel, no período escolhido.
export async function resumoVisitas(db, de, ate) {
    await garantirTabelasVisitas(db);
    const [totais, unicos, dias, paginas, origens] = await db.batch([
        db.prepare(`SELECT COALESCE(SUM(CASE WHEN dia BETWEEN ?1 AND ?2 THEN n END), 0) AS periodo,
                           COALESCE(SUM(CASE WHEN dia = date('now') THEN n END), 0) AS hoje,
                           COALESCE(SUM(n), 0) AS total FROM visitas`).bind(de, ate),
        db.prepare(`SELECT COALESCE(SUM(CASE WHEN dia BETWEEN ?1 AND ?2 THEN n END), 0) AS periodo,
                           COALESCE(SUM(CASE WHEN dia = date('now') THEN n END), 0) AS hoje FROM visitas_unicas`).bind(de, ate),
        db.prepare("SELECT dia, SUM(n) AS n FROM visitas WHERE dia BETWEEN ?1 AND ?2 GROUP BY dia ORDER BY dia").bind(de, ate),
        db.prepare("SELECT pagina, SUM(n) AS n FROM visitas WHERE dia BETWEEN ?1 AND ?2 GROUP BY pagina ORDER BY n DESC LIMIT 10").bind(de, ate),
        db.prepare(`SELECT origem, SUM(n) AS n FROM visitas WHERE dia BETWEEN ?1 AND ?2 AND origem != 'Dentro do site'
                    GROUP BY origem ORDER BY n DESC`).bind(de, ate),
    ]);
    return {
        visitas: totais.results[0].periodo, visitas_hoje: totais.results[0].hoje, visitas_total: totais.results[0].total,
        pessoas: unicos.results[0].periodo, pessoas_hoje: unicos.results[0].hoje,
        dias: dias.results, paginas: paginas.results, origens: origens.results,
    };
}
