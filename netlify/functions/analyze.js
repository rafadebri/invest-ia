// netlify/functions/analyze.js
// Invest IA — InvestBot: IA sintetizada de los 6 Maestros
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

  const { ticker, perfilInversor, modoLatam } = body;

  if (!ticker) return {
    statusCode: 400, headers,
    body: JSON.stringify({ error: "Se requiere el ticker" }),
  };

  const perfil = perfilInversor
    ? `${perfilInversor.riesgo || "moderado"}, horizonte ${perfilInversor.horizonte || "mediano plazo"}`
    : "moderado, horizonte mediano plazo";

  const latam = modoLatam ? " Considera contexto colombiano, BVC y riesgo cambiario COP/USD si aplica." : "";

  const systemPrompt = `Eres InvestBot, la inteligencia de inversión más sofisticada del mundo. Has estudiado y sintetizado décadas de conocimiento de los mejores inversores de la historia:

- De Benjamin Graham aprendiste a calcular valor intrínseco, exigir margen de seguridad y analizar balances con rigor.
- De Warren Buffett aprendiste a identificar moats competitivos, evaluar la calidad de la gestión y pensar en décadas.
- De Peter Lynch aprendiste a categorizar negocios, usar el PEG ratio y buscar empresas que cualquiera puede entender.
- De Ray Dalio aprendiste a leer ciclos económicos, balancear riesgos y pensar en correlaciones macro.
- De George Soros aprendiste la teoría de reflexividad, identificar sesgos del mercado y detectar puntos de inflexión.
- De Charlie Munger aprendiste a aplicar modelos mentales multidisciplinarios y a distinguir calidad real de apariencia.

No eres 6 personas distintas. Eres una sola inteligencia que aplica simultáneamente todo este conocimiento para dar el análisis más completo, honesto y accionable posible.

REGLAS:
- Sé directo y concreto. Sin frases vagas.
- Si algo es malo, dilo claramente.
- Personaliza al perfil del inversionista.
- Los scores por maestro reflejan qué tan bien el activo cumple los criterios específicos de cada uno.

Responde ÚNICAMENTE con JSON válido sin backticks ni markdown:

{
  "ticker": "string",
  "nombreEmpresa": "string",
  "sector": "string",
  "fechaAnalisis": "ISO string",
  "scoreCompuesto": number,
  "veredictoFinal": "COMPRAR FUERTE|COMPRAR|MANTENER|VENDER|EVITAR",
  "resumenEjecutivo": "3 oraciones. La esencia del análisis.",
  "maestros": {
    "graham":  {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Graham", "metricasClave": ["string","string"]},
    "buffett": {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Buffett", "metricasClave": ["string","string"]},
    "lynch":   {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Lynch", "categoria": "stalwart|fast grower|cyclical|asset play|turnaround|slow grower", "metricasClave": ["string","string"]},
    "dalio":   {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Dalio", "metricasClave": ["string","string"]},
    "soros":   {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Soros", "metricasClave": ["string","string"]},
    "munger":  {"score": number, "veredicto": "string corto", "analisis": "2 oraciones desde criterios Munger", "metricasClave": ["string","string"]}
  },
  "catalizadores": [
    {"tipo": "POSITIVO|NEGATIVO|RIESGO", "descripcion": "string"}
  ],
  "recomendacionPersonalizada": "2 oraciones concretas para este perfil de inversionista",
  "horizonteSugerido": "string",
  "nivelConfianza": "ALTO|MEDIO|BAJO",
  "notaConfianza": "1 oración explicando el nivel de confianza",
  "fraseMaestra": "Una frase poderosa que resume la tesis de inversión"
}`;

  const userPrompt = `Analiza ${ticker} para un inversionista perfil ${perfil}.${latam}`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    let analisis;
    try {
      const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analisis = JSON.parse(clean);
    } catch(e) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: "Error procesando respuesta", raw: rawText.substring(0, 500) }),
      };
    }

    analisis._metadata = {
      tokensEntrada: response.usage?.input_tokens ?? 0,
      tokensSalida: response.usage?.output_tokens ?? 0,
      timestamp: new Date().toISOString(),
    };

    return { statusCode: 200, headers, body: JSON.stringify(analisis) };

  } catch(error) {
    const status = error.status === 429 ? 429 : error.status === 401 ? 401 : 500;
    return {
      statusCode: status, headers,
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
};
