# Site da Nelsi

Loja de **Tupperware, perfumes e kits de beleza** com pedido pelo WhatsApp. Feito com o mesmo código dos sites do Carlos e do Matheus: Cloudflare Workers + banco D1, sem mensalidade de plataforma.

## O que tem

- **Catálogo** com fotos, preço, promoção (preço "de" riscado), esgotado, busca e filtro por categoria.
- **Pedir no WhatsApp:** cada produto abre o WhatsApp da Nelsi com a mensagem pronta (nome, preço e link).
- **Sacola:** o cliente junta vários produtos e manda a lista com o total numa mensagem só. A sacola fica só no aparelho do cliente.
- **Página de cada produto** (`/produto/<nome>/`), boa para o Google e para mandar no WhatsApp.
- **Painel** (`/admin/`), feito para usar no celular:
  - **Painel:** pedidos pelo WhatsApp e **relatório para repor o estoque** (mais pedidos e os que não tiveram nenhum pedido), com filtro de período e botão de copiar.
  - **Cadastro rápido:** escolhe várias fotos de uma vez e só preenche nome e preço de cada uma.
  - **Produtos:** cadastrar com foto (direto da câmera), preço, categoria, descrição; botões rápidos de Esgotado, Destaque e No site; ordem do catálogo.
  - **Aparência:** 6 temas de cores, 3 estilos de letra, logo em imagem (ou o nome escrito), faixa de aviso no topo com data para sumir, ligar e desligar seções da página inicial, e **Voltar ao original**.
  - **Dados da loja:** WhatsApp, foto, textos, entrega, pagamento, categorias, moeda (R$ ou €) e redes.
- Contagem de pedidos **sem cookies e sem guardar IP** (1 pedido por pessoa por produto por dia). O site não conta visitas. Política de privacidade em `/privacidade/`.
- Aviso de revendedora independente no rodapé: o site não usa logos das marcas e não se apresenta como oficial.

## Publicar no Cloudflare

1. Cloudflare → **Workers & Pages → Create → Import a repository** → escolha `Site-nelsi`. O banco D1 é criado sozinho.
2. No Worker, **Settings → Variables and Secrets → Add**, tipo **Secret**:
   - `ADMIN_EMAILS`: o e-mail (ou e-mails, separados por vírgula) de quem pode entrar no painel.
   - opcional `RESEND_API_KEY` e `EMAIL_REMETENTE`, para o e-mail de "esqueci minha senha".
3. Abra `/conta/cadastro/`, crie a senha com um dos e-mails acima e entre no painel.
4. Em **Dados da loja**, coloque o **WhatsApp** (com 55 e DDD). Sem ele, os botões de pedir não aparecem.
5. Domínio próprio: Worker → **Settings → Domains & Routes → Add → Custom domain**.

## Testar no computador

```
echo "ADMIN_EMAILS=seu@email.com" > .dev.vars   # o arquivo não vai para o GitHub
npx wrangler dev
```
