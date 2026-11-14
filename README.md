# Ensaios Pro 2.0

Gerador de ensaios/livros no **seu estilo**. Roda no navegador (PWA, instalável no PC e no celular) e como **APK**, com o mesmo código. Não depende de Rork, Expo Go nem de login.

## O que ele faz
- **Estrutura**: capítulo › seção › subseção, numeradas (1 › 1.1 › 1.1.1). Nunca menciona "pontos".
- **Roteiro**: `# Título` abre um capítulo; cada linha abaixo vira uma seção de **700–1100 palavras** (ajustável em Config.).
- **Metas por seção** (ajustáveis): ≥10% citações (autores, jornais, livros, contos), ≥5% anedotas históricas em estilo de cronista antigo, ≥2% citações diretas. Tudo integrado ao corpo do texto.
- **Verificação automática**: o app conta palavras e percentuais por código e pede à IA para refazer (até 3 tentativas) se não cumprir. O resultado aparece em etiquetas por seção.
- **Seu estilo**: envie 2–3 textos seus em Config. → "Extrair perfil de estilo". O perfil e trechos das amostras guiam toda a escrita.
- **Anexos** (.pdf, .docx, .txt, .md): o conteúdo entra na elaboração; para arquivos grandes, vão os trechos mais relevantes a cada seção.
- **Exporta** Word (.docx, ABNT: Times 12, 1,5, margens 3/2/3/2) e PDF. Com *Referências e notas de verificação* opcionais ao final.
- **Com ou sem Google**: sem login, tudo fica no aparelho. Com Client ID Google (opcional), envia .docx/.pdf e backup à pasta "Ensaios Pro" do Drive (escopo `drive.file`, só enxerga o que o app criou).

## Publicar (≈10 min, uma vez)
1. Crie um repositório no GitHub e envie **todo o conteúdo desta pasta** (confira que `.github/workflows` apareceu).
2. **Settings › Pages › Source: GitHub Actions** → a versão web sai em `https://SEU-USUARIO.github.io/NOME-DO-REPO/` (Pages em repositório privado exige plano pago; em público é grátis e não expõe nenhum segredo).
3. **Actions › "Gerar APK" › Run workflow**. Ao terminar, baixe o artefato **EnsaiosPro-APK** (zip com `app-debug.apk`) e instale no celular.
4. Abra o app › **Config.** › cole a chave da API Anthropic › Salvar.

### Proxy (opcional, recomendado se for dividir o app com alguém)
Cole `proxy-worker.js` num Cloudflare Worker (plano gratuito), defina `ANTHROPIC_API_KEY` e `ACCESS_CODE`, e informe o endereço do Worker e o código em Config. Assim a chave não fica no aparelho.

### Google Drive (opcional, só na versão web/PWA)
Google Cloud Console › Credenciais › ID do cliente OAuth › *Aplicativo da Web* › origem JavaScript autorizada = endereço do seu GitHub Pages. Cole o Client ID em Config. No APK o login Google é bloqueado pelo próprio Google em WebView; lá, o botão de exportar abre o menu Compartilhar (envie ao Drive por ele).

## Limites e cuidados
- **Citações**: modelos de IA erram autoria e wording. As citações diretas e anedotas vêm listadas com grau de confiança; **confira antes de publicar**.
- O APK gerado é *debug*: a assinatura muda a cada build. Antes de atualizar, faça **Backup (.json)** e desinstale a versão antiga.
- A chave da API fica no armazenamento do aparelho. O custo é o da API (≈ 2 a 4 chamadas por seção, por causa das correções).
- Primeira exportação/leitura de PDF precisa de internet (carrega as bibliotecas); depois ficam em cache.

## Desenvolvimento
`npm test` (núcleo) · `npm run build` (gera `www/`) · `node e2e.cjs` (teste de navegador, requer Playwright).
