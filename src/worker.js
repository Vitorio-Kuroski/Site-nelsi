// Worker do site da Nelsi no Cloudflare.
//
// /                      página inicial com o catálogo (src/loja.js)
// /produto/<slug>/       página do produto
// /pedir/<slug>          conta o pedido e abre o WhatsApp com a mensagem pronta
// /api/sacola            sacola com vários produtos → link do WhatsApp
// /imagens/<id>          fotos enviadas pelo painel
// /privacidade/          política de privacidade
// /sitemap.xml, /robots.txt
// /api/conta/*           login do painel (src/contas.js)
// /api/admin/*           painel (src/admin.js)
// Toda página aberta por uma pessoa é contada em src/visitas.js (sem cookies e sem guardar IP).
// O resto (estilos, scripts, login e o painel) vem da pasta public/.
import { rotasAdmin } from "./admin.js";
import { rotasConta } from "./contas.js";
import { contarVisita, deveContar } from "./visitas.js";
import { garantirTabelasLoja, imagem, paginaInicial, paginaPrivacidade, paginaProduto, pedir, sacola, sitemap } from "./loja.js";

export default {
    async fetch(request, env, ctx) {
        const resposta = await rotear(request, env, ctx);
        if (deveContar(request, resposta)) ctx.waitUntil(contarVisita(request, env));
        return resposta;
    },
};

async function rotear(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const leitura = request.method === "GET" || request.method === "HEAD";
    if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.slice(4);
        return Response.redirect(url.toString(), 301);
    }
    if (pathname === "/robots.txt") {
        return new Response(`User-agent: *\nDisallow: /admin/\nDisallow: /conta/\nDisallow: /pedir/\nSitemap: ${url.origin}/sitemap.xml\n`,
            { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (pathname.startsWith("/api/conta/")) return rotasConta(request, env, ctx);
    if (pathname.startsWith("/api/admin/")) return rotasAdmin(request, env);
    await garantirTabelasLoja(env.DB);
    if (pathname === "/api/sacola" && request.method === "POST") return sacola(request, env, ctx);
    if (leitura) {
        if (pathname === "/" || pathname === "/index.html") return paginaInicial(request, env);
        if (pathname === "/sitemap.xml") return sitemap(request, env);
        const produto = /^\/produto\/([a-z0-9-]+)(\/?)$/.exec(pathname);
        if (produto) return produto[2] ? paginaProduto(request, env, produto[1]) : Response.redirect(new URL(`/produto/${produto[1]}/`, url).toString(), 301);
        const pedido = /^\/pedir\/([a-z0-9-]+)\/?$/.exec(pathname);
        if (pedido) return pedir(request, env, ctx, pedido[1]);
        const img = /^\/imagens\/([a-f0-9]{32})$/.exec(pathname);
        if (img) return imagem(env, img[1]);
        if (pathname === "/privacidade") return Response.redirect(new URL("/privacidade/", url).toString(), 301);
        if (pathname === "/privacidade/") return paginaPrivacidade(request, env);
    }
    return env.ASSETS.fetch(request);
}
