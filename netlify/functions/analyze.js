exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { ticker, profileType, profileName, profileSub, mode } = JSON.parse(event.body);

    let prompt;

    if (mode === 'recommendations') {
      prompt = `Eres un experto en inversiones. Para un inversionista de perfil "${profileType}" (${profileName}: ${profileSub}), genera 5 recomendaciones de activos concretos para invertir ahora mismo en 2025.

Responde SOLO con JSON válido sin backticks:
{"recommendations":[{"ticker":"AAPL","name":"Apple Inc.","type":"Stock","grahamScore":45,"buffettScore":82,"profileScore":75,"verdict":"Esperar","reason":"2 oraciones explicando por qué para este perfil"}]}

Incluye mix de: acciones, ETFs, cripto si aplica al perfil. Usa datos reales actuales.`;
    } else {
      prompt = `Eres un experto en inversiones globales. Analiza el activo "${ticker}" para un inversionista perfil "${profileType}" (${profileName}: ${profileSub}).

Responde SOLO con JSON válido sin backticks ni markdown:
{
  "company":"nombre completo","ticker":"${ticker}","type":"Stock/Crypto/ETF/Commodity/Index","sector":"sector","marketCap":"3.2T o N/A",
  "metrics":{"peRatio":número_o_null,"pbRatio":número_o_null,"roe":número_%_o_null,"fcfMargin":número_%_o_null,"debtToEquity":número_o_null,"dividendYield":número_%_o_null,"volatility":"Baja/Media/Alta/Muy Alta","netMargin":número_%_o_null},
  "graham":{"score":0-100,"verdict":"Comprar/Esperar/Evitar","strengths":["x","y","z"],"weaknesses":["x","y"],"marginOfSafety":true/false,"reasoning":"2 oraciones"},
  "buffett":{"score":0-100,"verdict":"Comprar/Esperar/Evitar","strengths":["x","y","z"],"weaknesses":["x","y"],"hasMoat":true/false,"longTermBusiness":true/false,"reasoning":"2 oraciones"},
  "profileMatch":{"score":0-100,"compatible":true/false,"reason":"1 oración"},
  "comparison":{"winner":"Graham/Buffett/Ambos/Ninguno","isCheap":true/false,"isQuality":true/false,"finalVerdict":"Comprar/Esperar/Evitar","recommendation":"3 oraciones en español sencillo para perfil ${profileType}"}
}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
