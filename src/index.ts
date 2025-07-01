import { create, Whatsapp } from 'venom-bot';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// --- FUNÇÃO DE LOG SIMPLIFICADA ---
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}
// --- FIM FUNÇÃO DE LOG SIMPLIFICADA ---

const booksList = [
  { id: 1, name: '48 Leis do poder',     file: path.resolve(__dirname, 'books', 'livro.pdf'), preco: 12 },
  { id: 2, name: 'Quem pensa enriquece', file: path.resolve(__dirname, 'books', 'quem_pensa_enriquece.pdf'), preco: 12 },
  { id: 3, name: 'O que todo corpo fala', file: path.resolve(__dirname, 'books', 'o_que_todo_corpo_fala.pdf'), preco: 12 },
];

const chavePix = 'seu-pix@email.com';

const estadoClientes = new Map<string, {
  etapa: 'inicio' | 'aguardando_pagamento' | 'aguardando_brinde' | 'aguardando_comprovante',
  livrosSelecionados: string[],
  brinde?: string
}>();

const pastaTmp = path.resolve(__dirname, 'tmp');
if (!fs.existsSync(pastaTmp)) {
  fs.mkdirSync(pastaTmp);
  log('INFO', `Pasta temporária criada: ${pastaTmp}`);
}

async function start(client: Whatsapp) {
  log('INFO', 'Bot iniciado e pronto para receber mensagens.');

  client.onMessage(async (message) => {
    const numero = message.from;
    const texto = message.body?.trim().toLowerCase();
    const cliente = estadoClientes.get(numero);

    log('INFO', `Mensagem recebida de ${numero}: "${texto}"`);

    if (texto === 'teste' && !message.isGroupMsg) {
      estadoClientes.set(numero, {
        etapa: 'inicio',
        livrosSelecionados: []
      });
      log('INFO', `Usuário ${numero} iniciou o fluxo de compra.`);
      await client.sendText(numero, '📚 Olá! Aqui estão nossos livros disponíveis por *R$12* cada:');
      await client.sendText(numero, booksList.map(b => `• ${b.name}`).join('\n'));
      await client.sendText(numero, 'Responda com o nome ou parte do nome dos livros que deseja.');
      return;
    }

    if (cliente?.etapa === 'inicio') {
      const livrosSelecionados = booksList.filter(book =>
        texto.includes(book.name.toLowerCase())
      );

      if (livrosSelecionados.length === 0) {
        log('WARN', `Usuário ${numero} tentou selecionar livro inválido: "${texto}"`);
        await client.sendText(numero, '❌ Livro não encontrado. Tente com o nome correto.');
        return;
      }

      const novosLivros = [...cliente.livrosSelecionados, ...livrosSelecionados.map(b => b.name)];
      log('INFO', `Usuário ${numero} selecionou livros: ${novosLivros.join(', ')}`);

      const total = novosLivros.length * 12;
      await client.sendText(numero, `📘 Você escolheu:\n${novosLivros.map(n => `• ${n}`).join('\n')}`);

      if (novosLivros.length >= 2) {
        estadoClientes.set(numero, {
          etapa: 'aguardando_brinde',
          livrosSelecionados: novosLivros
        });
        log('INFO', `Usuário ${numero} qualificado para brinde.`);
        await client.sendText(numero, `🎁 Como você escolheu 2 ou mais livros, ganhou 1 de brinde!`);
        await client.sendText(numero, `Escolha mais um livro da lista como presente:`);
        await client.sendText(numero, booksList.map(b => `• ${b.name}`).join('\n'));
      } else {
        estadoClientes.set(numero, {
          etapa: 'aguardando_pagamento',
          livrosSelecionados: novosLivros
        });
        log('INFO', `Usuário ${numero} aguardando pagamento de R$${total},00.`);
        await client.sendText(numero, `💰 O total é *R$${total},00*`);
        await client.sendText(numero, `Envie o PIX para:
*${chavePix}*`);
        await client.sendText(numero, 'Depois, envie o comprovante aqui.');
      }
      return;
    }

    if (cliente?.etapa === 'aguardando_brinde') {
      const brindeEscolhido = booksList.find(book =>
        texto.includes(book.name.toLowerCase()) &&
        !cliente.livrosSelecionados.includes(book.name)
      );

      if (!brindeEscolhido) {
        log('WARN', `Usuário ${numero} tentou escolher brinde inválido: "${texto}"`);
        await client.sendText(numero, '❌ Livro inválido ou já escolhido. Tente outro da lista.');
        return;
      }

      estadoClientes.set(numero, {
        ...cliente,
        etapa: 'aguardando_pagamento',
        brinde: brindeEscolhido.name
      });
      log('INFO', `Usuário ${numero} escolheu brinde: ${brindeEscolhido.name}. Aguardando pagamento.`);
      await client.sendText(numero, `🎉 Seu brinde será: *${brindeEscolhido.name}*.`);
      await client.sendText(numero, `💰 Agora envie R$${cliente.livrosSelecionados.length * 12},00 para:`);
      await client.sendText(numero, `*${chavePix}*`);
      await client.sendText(numero, 'Depois, envie o comprovante aqui.');
      return;
    }

    if (cliente?.etapa === 'aguardando_pagamento') {
      if (message.mimetype?.includes('image')) {
        const caminho = path.join(pastaTmp, `comprovante-${numero}.jpg`);
        const buffer = await client.decryptFile(message);

        fs.mkdirSync(path.dirname(caminho), { recursive: true });
        fs.writeFileSync(caminho, buffer);
        log('INFO', `Usuário ${numero} enviou comprovante. Salvando em ${caminho}`);

        await client.sendText(numero, '🕵️‍♂️ Verificando seu comprovante...');

        Tesseract.recognize(caminho, 'por').then(async ({ data: { text } }) => {
          log('INFO', `OCR do comprovante de ${numero} resultado: "${text.substring(0, Math.min(text.length, 100))}"`);
          if (text.includes('30') || text.includes(chavePix)) {
            log('INFO', `Comprovante de ${numero} validado com sucesso.`);
            await client.sendText(numero, '✅ Comprovante validado com sucesso! Seus livros serão enviados agora.');

            const livrosComprados = booksList.filter(b => cliente.livrosSelecionados.includes(b.name));
            if (cliente.brinde) {
              const livroBrinde = booksList.find(b => b.name === cliente.brinde);
              if (livroBrinde) livrosComprados.push(livroBrinde);
            }

            for (const livro of livrosComprados) {
              log('INFO', `Enviando livro ${livro.name} para ${numero}.`);
              await client.sendFile(numero, livro.file, `${livro.name}.pdf`, `📘 Aqui está: ${livro.name}`);
            }
            estadoClientes.delete(numero);
            log('INFO', `Fluxo de compra finalizado para ${numero}.`);
          } else {
            log('WARN', `Comprovante de ${numero} inválido ou não legível. Texto OCR: "${text.substring(0, Math.min(text.length, 100))}"`);
            await client.sendText(numero, '⚠️ Comprovante inválido ou não legível. Verifique e envie novamente.');
          }
        }).catch(ocrErr => {
          log('ERROR', `Erro no OCR para comprovante de ${numero}:`, ocrErr);
          client.sendText(numero, '❌ Ocorreu um erro ao processar seu comprovante. Tente novamente mais tarde.');
        });
        return;
      } else {
        log('INFO', `Usuário ${numero} enviou algo que não é imagem na etapa de pagamento.`);
        await client.sendText(numero, '❗ Por favor, envie o comprovante como *imagem* para validarmos.');
        return;
      }
    }

    if (!cliente) {
      log('INFO', `Mensagem fora do fluxo de ${numero}: "${texto}"`);
    }
  });
}

create({
  session: 'session-bot', // Adicionado para atender ao tipo CreateOptions
  devtools: false,
  autoClose: 0,
  browserArgs: [
    '--no-sandbox', // Essencial para rodar em VPS
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', // Reduz o uso de /dev/shm
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--disable-web-security',
    '--disable-features=site-per-process',
    '--disable-site-isolation-trials',
    '--disable-speech-api',
    '--disk-cache-size=33554432',
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--force-color-profile=srgb',
    '--media-cache-size=33554432',
    '--proxy-bypass-list=*',
    '--safebrowsing-disable-auto-update',
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--ignore-certificate-errors-spki-list',
    '--disable-software-rasterizer',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-features=ImprovedCookieControls,LazyImageLoading,Prefetch,ScriptStreaming,TranslateUI',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--enable-automation',
    '--enable-logging',
    '--log-level=0',
    '--v=1',
    '--disable-infobars',
    '--window-size=1920,1080',
  ],
  logQR: true,
  updatesLog: true,
  createPathFileToken: true,
  folderNameToken: 'tokens',
}).then(client => start(client)).catch(err => {
  log('ERROR', 'Erro fatal ao iniciar Venom:', err);
  process.exit(1);
});