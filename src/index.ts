import { create, Whatsapp } from 'venom-bot';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const booksList = [
  { id: 1, name: '48 Leis do poder',     file: path.resolve(__dirname, './books/livro.pdf'), preco: 12 },
  { id: 2, name: 'Quem pensa enriquece', file: './books/quem_pensa_enriquece.pdf', preco: 12 },
  { id: 3, name: 'O que todo corpo fala', file: './books/o_que_todo_corpo_fala.pdf', preco: 12 },
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
}

async function start(client: Whatsapp) {
  client.onMessage(async (message) => {
    const numero = message.from;
    const texto = message.body?.trim().toLowerCase();
    const cliente = estadoClientes.get(numero);

    if (texto === 'teste' && !message.isGroupMsg) {
      estadoClientes.set(numero, {
        etapa: 'inicio',
        livrosSelecionados: []
      });

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
        await client.sendText(numero, '❌ Livro não encontrado. Tente com o nome correto.');
        return;
      }

      const novosLivros = [...cliente.livrosSelecionados, ...livrosSelecionados.map(b => b.name)];

      const total = novosLivros.length * 12;
      await client.sendText(numero, `📘 Você escolheu:\n${novosLivros.map(n => `• ${n}`).join('\n')}`);

      if (novosLivros.length >= 2) {
        estadoClientes.set(numero, {
          etapa: 'aguardando_brinde',
          livrosSelecionados: novosLivros
        });

        await client.sendText(numero, `🎁 Como você escolheu 2 ou mais livros, ganhou 1 de brinde!`);
        await client.sendText(numero, `Escolha mais um livro da lista como presente:`);
        await client.sendText(numero, booksList.map(b => `• ${b.name}`).join('\n'));
      } else {
        estadoClientes.set(numero, {
          etapa: 'aguardando_pagamento',
          livrosSelecionados: novosLivros
        });

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
        await client.sendText(numero, '❌ Livro inválido ou já escolhido. Tente outro da lista.');
        return;
      }

      estadoClientes.set(numero, {
        ...cliente,
        etapa: 'aguardando_pagamento',
        brinde: brindeEscolhido.name
      });

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

        await client.sendText(numero, '🕵️‍♂️ Verificando seu comprovante...');

        Tesseract.recognize(caminho, 'por').then(async ({ data: { text } }) => {
          if (text.includes('30') || text.includes(chavePix)) {
            await client.sendText(numero, '✅ Comprovante validado com sucesso! Seus livros serão enviados agora.');

            const livrosComprados = booksList.filter(b => cliente.livrosSelecionados.includes(b.name));
            if (cliente.brinde) {
              const livroBrinde = booksList.find(b => b.name === cliente.brinde);
              if (livroBrinde) livrosComprados.push(livroBrinde);
            }

            for (const livro of livrosComprados) {
              await client.sendFile(numero, livro.file, `${livro.name}.pdf`, `📘 Aqui está: ${livro.name}`);
            }
            estadoClientes.delete(numero);
          } else {
            await client.sendText(numero, '⚠️ Comprovante inválido ou não legível. Verifique e envie novamente.');
          }
        });
        return;
      } else {
        await client.sendText(numero, '❗ Por favor, envie o comprovante como *imagem* para validarmos.');
        return;
      }
    }

    if (!cliente) {
      console.log('Mensagem fora do fluxo:', texto);
    }
  });
}

create({
  session: 'venda3',
  headless: 'new',
  browserArgs: ['--headless=new']
}).then(client => start(client)).catch(err => console.error('Erro ao iniciar Venom:', err));
