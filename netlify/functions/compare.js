// netlify/functions/compare.js
// Invest IA — Comparador de Activos
// Rafael De Brigard · Pontificia Universidad Javeriana · Bogotá, Colombia

const Anthropic = require("@anthropic-ai/sdk");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return {
    statusCode: 405, headers,
    body: JSON.stringify({ error: "Método no permitido" }),
  };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Cuerpo inválido" }) }; }

  const { tickers, perfilInversor, modoLatam } = body;

  if (!tickers || tickers.length < 2 || tickers.length > 3) {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: "Debes comparar entre 2 y 3 activos" }),
    };
  }

  const perfilTexto = perfilInversor ? `
PERFIL DEL INVERSIONISTA:
- Tipo: ${perfilInversor.tipo || "moderado"}
- Tolerancia al riesgo: ${perfilInversor.riesgo || "media"}
- Horizonte: ${perfilInversor.horizonte || "mediano plazo"}
` : "PERFIL: No especificado. Asume perfil moderado.";

  const contextoLatam = modoLatam ? `
CONTEXTO LATAM: Considera el entorno colombiano, riesgo cambiario COP/USD y disponibilidad para inversionistas colombianos.
` : "";

  const systemPrompt = `Eres el Comparador de Activos del Consejo de Maestros de Invest IA. Tu trabajo es analizar múltiples activos simultáneamente y compararlos de forma directa, honesta y accionable.

Para cada activo aplicas los criterios de los 6 maestros (Graham, Buffett, Lynch, Dalio, Soros, Munger) y luego los comparas entre sí para determinar cuál es la mejor opción según el perfil del inversionista.

REGLAS:
- Sé directo: di cuál es mejor y por qué
- Compara métricas equivalentes cuando existan
- Considera el perfil del inversionista para la recomendación final
- Si son activos de diferentes categorías (ej: acción vs cripto), explica cómo se complementan en vez de solo competir
- No uses lenguaje vago — cada afirmación debe ser concreta

Responde ÚNICAMENTE con JSON válido, sin backticks. Estructura exacta:

{
  "tickers": ["string"],
  "fechaComparacion": "ISO string",
  "resumenComparacion": "string (3-4 oraciones directas sobre el resultado de la comparación)",
  "ganadorGeneral": "string (ticker del ganador o 'Empate')",
  "razonGanador": "string (2-3 oraciones explicando por qué ganó)",
  "activos": [
    {
      "ticker": "string",
      "nombre": "string",
      "tipo": "string",
      "sector": "string",
      "scores": {
        "graham": number,
        "buffett": number,
        "lynch": number,
        "dalio": number,
        "soros": number,
        "munger": number,
        "compuesto": number
      },
      "veredicto": "COMPRAR FUERTE" | "COMPRAR" | "MANTENER" | "VENDER" | "EVITAR",
      "fortalezas": ["string", "string", "string"],
      "debilidades": ["string", "string"],
      "mejorPara": "string (tipo de inversionista para quien es ideal)",
      "peorPara": "string (tipo de inversionista que debería evitarlo)",
      "horizonteIdeal": "string",
      "riesgo": "Bajo" | "Medio" | "Alto" | "Muy Alto",
      "resumenMaestros": "string (3-4 oraciones con la visión consolidada de los 6 maestros)"
    }
  ],
  "comparativaDirecta": [
    {
      "criterio": "string (ej: Valor intrínseco, Calidad del negocio, Momentum...)",
      "ganador": "string (ticker)",
      "explicacion": "string (1-2 oraciones)"
    }
  ],
  "recomendacionFinal": "string (recomendación personalizada al perfil del usuario, concreta y accionable)",
  "estrategiaCombinada": "string (si tiene sentido tener ambos/los tres en portafolio, explica cómo se complementan)",
  "fraseMaestra": "string (frase memorable de uno de los maestros)"
}`;

  const userPrompt = `Compara estos activos de forma exhaustiva:

ACTIVOS A COMPARAR: ${tickers.join(' vs ')}
${perfilTexto}
${contextoLatam}

Analiza cada uno con los 6 maestros y determina cuál es la mejor inversión para este perfil. Sé directo y concreto.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    let resultado;
    try {
      const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      resultado = JSON.parse(clean);
    } catch(e) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: "Error procesando respuesta", raw: rawText.substring(0, 300) }),
      };
    }

    resultado._metadata = {
      tokensEntrada: response.usage?.input_tokens ?? 0,
      tokensSalida: response.usage?.output_tokens ?? 0,
      timestamp: new Date().toISOString(),
    };

    return { statusCode: 200, headers, body: JSON.stringify(resultado) };

  } catch(error) {
    const status = error.status === 429 ? 429 : error.status === 401 ? 401 : 500;
    return {
      statusCode: status, headers,
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
};
