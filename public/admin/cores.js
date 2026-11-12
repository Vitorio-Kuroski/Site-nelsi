// Cores do site: os temas prontos e a "Minha cor" (a Nelsi escolhe qualquer cor e o resto da paleta é calculado).
// Usado pelo Worker (para montar a página) e pelo painel (prévia ao vivo). Sem dependências.

export const TEMAS = {
    vinho: { nome: "Vinho", cores: { "--vinho": "#8E2445", "--vinho-escuro": "#6E1734", "--vinho-claro": "#F6E3E8", "--fundo": "#FBF6F1", "--fundo-2": "#F4EBE2", "--linha": "#EADFD6", "--dourado": "#B88A3E" } },
    rosa: { nome: "Rosa", cores: { "--vinho": "#C2407A", "--vinho-escuro": "#9E2F61", "--vinho-claro": "#FBE4EF", "--fundo": "#FFF7FA", "--fundo-2": "#FBEAF1", "--linha": "#F1DCE5", "--dourado": "#A8616E" } },
    lilas: { nome: "Lilás", cores: { "--vinho": "#6E4BA8", "--vinho-escuro": "#553885", "--vinho-claro": "#EEE6FA", "--fundo": "#FAF7FD", "--fundo-2": "#F0EAF8", "--linha": "#E3DAF0", "--dourado": "#8A6BB8" } },
    oliva: { nome: "Verde-oliva", cores: { "--vinho": "#5E6B2E", "--vinho-escuro": "#465122", "--vinho-claro": "#ECEFDC", "--fundo": "#FAF8F1", "--fundo-2": "#F0EEE0", "--linha": "#E2DFCB", "--dourado": "#957728" } },
    preto: { nome: "Preto e dourado", cores: { "--vinho": "#1F1B1A", "--vinho-escuro": "#000", "--vinho-claro": "#EFE6D6", "--fundo": "#FBF8F3", "--fundo-2": "#F2ECE2", "--linha": "#E5DDCF", "--dourado": "#A27A2E" } },
    marinho: { nome: "Azul-marinho", cores: { "--vinho": "#1F3A68", "--vinho-escuro": "#152A4F", "--vinho-claro": "#E2E9F5", "--fundo": "#F7F9FC", "--fundo-2": "#EAEFF7", "--linha": "#DCE3EE", "--dourado": "#9A7633" } },
    coral: { nome: "Coral", cores: { "--vinho": "#C8463C", "--vinho-escuro": "#A3352D", "--vinho-claro": "#FCE5E1", "--fundo": "#FFF8F5", "--fundo-2": "#FBECE6", "--linha": "#F1DDD5", "--dourado": "#A8603A" } },
    turquesa: { nome: "Turquesa", cores: { "--vinho": "#12807A", "--vinho-escuro": "#0C625D", "--vinho-claro": "#DDF2F0", "--fundo": "#F6FBFA", "--fundo-2": "#E7F3F1", "--linha": "#D5E8E5", "--dourado": "#957328" } },
    terracota: { nome: "Terracota", cores: { "--vinho": "#A8502E", "--vinho-escuro": "#843C20", "--vinho-claro": "#F6E4DA", "--fundo": "#FCF7F2", "--fundo-2": "#F3E8DE", "--linha": "#E9DACB", "--dourado": "#8A6A2E" } },
    nude: { nome: "Nude", cores: { "--vinho": "#9C6B5E", "--vinho-escuro": "#7D5247", "--vinho-claro": "#F3E6E1", "--fundo": "#FCF8F6", "--fundo-2": "#F3EAE5", "--linha": "#EADDD6", "--dourado": "#9A744A" } },
    vermelho: { nome: "Vermelho", cores: { "--vinho": "#B3202E", "--vinho-escuro": "#8C1622", "--vinho-claro": "#FAE1E3", "--fundo": "#FFF8F7", "--fundo-2": "#F8ECEB", "--linha": "#EFDADA", "--dourado": "#A07428" } },
    ceu: { nome: "Azul-céu", cores: { "--vinho": "#2E6FA8", "--vinho-escuro": "#225582", "--vinho-claro": "#E2EEF8", "--fundo": "#F7FAFD", "--fundo-2": "#EAF2F9", "--linha": "#D8E5F1", "--dourado": "#957330" } },
};

// Paleta ampliada do painel: 8 famílias, do mais claro ao mais escuro
export const PALETA = [
    ["Rosas", ["#F48FB1", "#EC407A", "#D81B60", "#AD1457", "#880E4F"]],
    ["Vermelhos", ["#EF5350", "#E53935", "#C62828", "#A31B26", "#7F1D1D"]],
    ["Laranjas e corais", ["#FF8A65", "#F4511E", "#D84315", "#BF5B2C", "#8D3B1F"]],
    ["Amarelos e dourados", ["#FFD54F", "#FBC02D", "#D4A017", "#B8862B", "#8C6A1F"]],
    ["Verdes", ["#81C784", "#43A047", "#2E7D32", "#5E6B2E", "#1B5E20"]],
    ["Azuis e turquesas", ["#4DD0E1", "#00897B", "#1E88E5", "#1F5FA8", "#1A2F5A"]],
    ["Roxos e lilases", ["#B39DDB", "#9575CD", "#7E57C2", "#5E35B1", "#4A148C"]],
    ["Terrosos e neutros", ["#C9A99A", "#A1887F", "#8D6E63", "#5D4037", "#2B2B2B"]],
];

const hexOk = (t) => /^#[0-9a-f]{6}$/i.test(String(t || ""));

function hexParaHsl(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}

function hslParaHex(h, s, l) {
    const f = (n) => {
        const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function luminancia(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
}

// Escurece a cor só o necessário para o texto ficar legível sobre o fundo dado (mínimo 4,5:1)
function escurecerAte(hex, fundo, minimo = 4.5) {
    let [h, s, l] = hexParaHsl(hex), cor = hex.toUpperCase();
    while (contraste(cor, fundo) < minimo && l > 0.04) { l -= 0.01; cor = hslParaHex(h, s, l); }
    return cor;
}

// A partir de uma cor qualquer, monta a paleta inteira do site
export function paletaDe(hex) {
    const original = hexOk(hex) ? hex.toUpperCase() : "#8E2445";
    const principal = escurecerAte(original, "#FFFFFF");
    const [h, s, l] = hexParaHsl(principal);
    const fundo = hslParaHex(h, Math.min(s, 0.45), 0.98);
    const cores = {
        "--vinho": principal,
        "--vinho-escuro": hslParaHex(h, s, Math.max(0.03, l - 0.09)),
        "--vinho-claro": hslParaHex(h, Math.min(s, 0.65), 0.93),
        "--fundo": fundo,
        "--fundo-2": hslParaHex(h, Math.min(s, 0.35), 0.945),
        "--linha": hslParaHex(h, Math.min(s, 0.3), 0.87),
        "--dourado": escurecerAte(hslParaHex(h, Math.min(s, 0.55), 0.42), fundo),
    };
    return { cores, original, ajustada: principal !== original };
}

export function coresDoTema(tema, corPropria) {
    if (tema === "propria" && hexOk(corPropria)) return paletaDe(corPropria).cores;
    return (TEMAS[tema] || TEMAS.vinho).cores;
}

export { hexOk };
