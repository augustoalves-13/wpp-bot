import Tesseract from 'tesseract.js';

Tesseract.recognize('./src/images/imagem.png', 'por').then(({ data: { text } }) => {
  console.log('Texto extraído:', text);
});
