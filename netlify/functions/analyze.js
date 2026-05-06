// netlify/functions/analyze.js
// Invest IA — Motor de análisis con los 6 Maestros Inversores
// Rafael De Brigard · Pontificia Universidad Javeriana · Bogotá, Colombia

const Anthropic = require("@anthropic-ai/sdk");

exports.handler = async (event) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  // ── PARSEO DE ENTRADA ─────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Cuerpo de la solicitud inválido" }),
    };
  }

  const {
    ticker,           // Ej: "AAPL", "ECOPETROL", "BTC-USD"
    companyName,      // Nombre legible, opcional
    sector,           // Sector de la empresa, opcional
    perfilInversor,   // Objeto con datos del perfil del usuario
    datosFinancieros, // Objeto con métricas clave (opcionales, el usuario puede no tenerlas)
    modoLatam,        // Boolean: true → análisis en contexto BVC / COP
  } = body;

  if (!ticker) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Se requiere el ticker del activo" }),
    };
  }

  // ── CONSTRUCCIÓN DEL PROMPT MAESTRO ───────────────────────────────────────
  const perfilTexto = perfilInversor
    ? `
PERFIL DEL INVERSIONISTA:
- Horizonte temporal: ${perfilInversor.horizonte || "no especificado"}
- Tolerancia al riesgo: ${perfilInversor.riesgo || "no especificado"}
- Objetivo: ${perfilInversor.objetivo || "no especificado"}
- Experiencia: ${perfilInversor.experiencia || "no especificado"}
- Capital disponible: ${perfilInversor.capital || "no especificado"}
`
    : "";

  const datosTexto = datosFinancieros
    ? `
DATOS FINANCIEROS PROPORCIONADOS:
- P/E Ratio: ${datosFinancieros.pe ?? "N/D"}
- P/B Ratio: ${datosFinancieros.pb ?? "N/D"}
- ROE: ${datosFinancieros.roe ?? "N/D"}%
- Deuda/Patrimonio: ${datosFinancieros.deudaPatrimonio ?? "N/D"}
- Margen neto: ${datosFinancieros.margenNeto ?? "N/D"}%
- Crecimiento de ingresos (YoY): ${datosFinancieros.crecimientoIngresos ?? "N/D"}%
- Dividendo: ${datosFinancieros.dividendo ?? "N/D"}%
- Capitalización de mercado: ${datosFinancieros.marketCap ?? "N/D"}
- PEG Ratio: ${datosFinancieros.peg ?? "N/D"}
- Margen operativo: ${datosFinancieros.margenOperativo ?? "N/D"}%
- Flujo de caja libre: ${datosFinancieros.fcf ?? "N/D"}
- Precio actual: ${datosFinancieros.precio ?? "N/D"}
`
    : "DATOS FINANCIEROS: No proporcionados. Usa tu conocimiento actualizado sobre este activo.";

  const contextoLatam = modoLatam
    ? `
CONTEXTO ESPECIAL — MODO LATAM:
- Considera el contexto de la Bolsa de Valores de Colombia (BVC) si aplica
- Ten en cuenta el riesgo cambiario COP/USD
- Considera el entorno macroeconómico colombiano (inflación, tasas Banco de la República, riesgo político)
- Si el activo cotiza en pesos colombianos, ajusta el análisis de valoración en consecuencia
- Menciona si el activo tiene ADR o acciones disponibles para inversionistas colombianos
`
    : "";

  const systemPrompt = `Eres el Consejo de los 6 Maestros Inversores, un sistema de análisis de inversiones de élite que combina las filosofías y metodologías de los mejores inversores de la historia. Tu trabajo es analizar activos financieros con la profundidad y sabiduría colectiva de:

1. **BENJAMIN GRAHAM** — El padre del value investing. Analiza margen de seguridad, valor intrínseco, activos netos, ratio P/B y solidez del balance.

2. **WARREN BUFFETT** — El mejor inversor de todos los tiempos. Evalúa el moat competitivo (ventaja duradera), calidad de la gestión, poder de fijación de precios, rentabilidad sostenida y horizonte de largo plazo.

3. **PETER LYNCH** — El genio del crecimiento. Busca empresas que cualquiera puede entender, analiza el PEG ratio, crecimiento de ganancias, e historias de inversión claras. Categoriza en: stalwart, fast grower, cyclical, asset play, turnaround o slow grower.

4. **RAY DALIO** — El maestro macro. Evalúa el contexto del ciclo económico, posición en el ciclo de deuda, correlaciones con la economía global y diversificación de portafolio.

5. **GEORGE SOROS** — El maestro de la reflexividad. Analiza el sentimiento del mercado, momentum, sesgos del consenso, oportunidades contrarian y puntos de inflexión.

6. **CHARLIE MUNGER** — El socio intelectual. Aplica modelos mentales multidisciplinarios, evalúa calidad vs precio, identifica "moats" psicológicos y advierte sobre trampas cognitivas.

INSTRUCCIONES DE ANÁLISIS:
- Analiza el activo desde la perspectiva única de CADA maestro
- Asigna un score de 0-100 por maestro basado en sus criterios específicos
- Calcula un score compuesto ponderado final
- Identifica los principales riesgos y catalizadores
- Personaliza la recomendación al perfil del inversionista si está disponible
- Sé directo, concreto y accionable — no des respuestas vagas
- Si no tienes datos específicos, usa tu conocimiento actualizado y acláralo
- Responde SIEMPRE en español

FORMATO DE RESPUESTA — Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código, sin explicaciones fuera del JSON. El objeto debe seguir exactamente esta estructura:

{
  "ticker": "string",
  "nombreEmpresa": "string",
  "sector": "string",
  "fechaAnalisis": "string ISO",
  "scoreCompuesto": number (0-100),
  "veredictoFinal": "COMPRAR FUERTE" | "COMPRAR" | "MANTENER" | "VENDER" | "EVITAR",
  "resumenEjecutivo": "string (3-4 oraciones directas)",
  "maestros": {
    "graham": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string (análisis específico desde su perspectiva, 3-5 oraciones)",
      "metricasClave": ["string", "string", "string"]
    },
    "buffett": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string",
      "metricasClave": ["string", "string", "string"]
    },
    "lynch": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string",
      "categoria": "stalwart | fast grower | cyclical | asset play | turnaround | slow grower",
      "metricasClave": ["string", "string", "string"]
    },
    "dalio": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string",
      "metricasClave": ["string", "string", "string"]
    },
    "soros": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string",
      "metricasClave": ["string", "string", "string"]
    },
    "munger": {
      "score": number (0-100),
      "veredicto": "string corto",
      "analisis": "string",
      "metricasClave": ["string", "string", "string"]
    }
  },
  "cataliz adores": [
    { "tipo": "POSITIVO" | "NEGATIVO" | "RIESGO", "descripcion": "string" }
  ],
  "recomendacionPersonalizada": "string (ajustada al perfil del inversionista, si aplica)",
  "horizonteSugerido": "string (ej: 3-5 años, corto plazo, etc.)",
  "nivelConfianza": "ALTO" | "MEDIO" | "BAJO",
  "notaConfianza": "string (explica por qué el nivel de confianza es ese)",
  "fraseMaestra": "string (una frase memorable de uno de los maestros que resume el análisis)"
}`;

  const userPrompt = `Analiza el siguiente activo con el Consejo de los 6 Maestros:

ACTIVO: ${ticker}${companyName ? ` (${companyName})` : ""}${sector ? ` — Sector: ${sector}` : ""}

${datosTexto}
${perfilTexto}
${contextoLatam}

Proporciona un análisis profundo, honesto y accionable. Si el activo tiene problemas serios, dílo claramente. Si es una oportunidad excepcional, explica por qué.`;

  // ── LLAMADA A LA API DE CLAUDE ────────────────────────────────────────────
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extraer el texto de la respuesta
    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parsear el JSON de la respuesta
    let analisis;
    try {
      // Limpiar posibles bloques de código si Claude los incluye
      const cleanText = rawText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analisis = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Error parseando JSON de Claude:", parseError);
      console.error("Respuesta cruda:", rawText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Error procesando la respuesta de la IA",
          detalle: "La respuesta no tiene el formato esperado",
          respuestaRaw: rawText.substring(0, 500),
        }),
      };
    }

    // Agregar metadata del uso de tokens
    analisis._metadata = {
      tokensEntrada: response.usage?.input_tokens ?? 0,
      tokensSalida: response.usage?.output_tokens ?? 0,
      modelo: response.model,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(analisis),
    };
  } catch (error) {
    console.error("Error llamando a Claude API:", error);

    // Manejo de errores específicos de Anthropic
    if (error.status === 401) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "API key inválida o no configurada" }),
      };
    }

    if (error.status === 429) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: "Límite de solicitudes alcanzado. Intenta en unos minutos.",
        }),
      };
    }

    if (error.status === 529) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: "La API de Claude está sobrecargada. Intenta en unos momentos.",
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Error interno del servidor",
        detalle: error.message || "Error desconocido",
      }),
    };
  }
};
