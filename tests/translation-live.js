// Optional network check; sends only these public example phrases to Google.
const { createTranslator } = require('../translation');
(async () => {
  const translate = createTranslator();
  for (const text of ['Good afternoon', 'Good night', "Let's learn something new today", 'take off']) {
    console.log(JSON.stringify({ text, translation: await translate(text) }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
