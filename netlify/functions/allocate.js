// netlify/functions/allocate.js
// Invest IA — Asignador de Capital Inteligente
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

  const {
    capitalDisponible,   // número: cuánto dinero tiene (USD o COP)
    moneda,              // "USD" | "COP"
    activos,             // array de strings: tickers que quiere considerar (opcional)
    perfilInversor,      // objeto del perfil del usuario
    modoLatam,           // boolean
    restricciones,       // string: ej "no quiero cripto", "solo acciones"
  } = body;

  if (!capitalDisponible || capitalDisponible <= 0) {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: "Capital disponible inválido" }),
    };
  }

  const monedaLabel = moneda === "COP" ? "pesos colombianos (COP)" : "dólares (USD)";
  const activosTexto = activos?.length
    ? `El usuario quiere considerar específicamente estos activos: ${activos.join(", ")}. Puedes incluir otros si son mejores para su perfil.`
    : "El usuario no especificó activos. Tú debes seleccionar los mejores para su perfil.";

  const perfilTexto = perfilInversor ? `
PERFIL DEL INVERSIONISTA:
- Tipo: ${perfilInversor.tipo || "moderado"}
- Tolerancia al riesgo: ${perfilInversor.riesgo || "media"}
- Horizonte: ${perfilInversor.horizonte || "mediano plazo"}
- Objetivo: ${perfilInversor.objetivo || "crecimiento equilibrado"}
` : "PERFIL: No especificado. Asume perfil moderado.";

  const restriccionesTexto = restricciones
    ? `RESTRICCIONES DEL USUARIO: ${restricciones}`
    : "";

  const contextoLatam = modoLatam ? `
CONTEXTO LATAM:
- Considera activos de la Bolsa de Valores de Colombia (BVC) si aplican
- Ten en cuenta el riesgo cambiario COP/USD
- Incluye opciones de renta fija colombiana (CDTs, TES) si el perfil lo sugiere
- Menciona el impacto del entorno macroeconómico colombiano
` : "";

  const systemPrompt = `Eres el Asignador de Capital de Invest IA, un sistema experto en construcción de portafolios que combina las filosofías de Graham, Buffett, Lynch, Dalio, Soros y Munger.

Tu trabajo es tomar el capital disponible de un inversionista y distribuirlo de forma óptima entre activos seleccionados, justificando cada decisión con principios de los maestros.

REGLAS DE ASIGNACIÓN:
- Máximo 8 activos en el portafolio (menos es más — Munger)
- Nunca pongas más del 40% en un solo activo
- Nunca pongas menos del 3% en un activo (si no vale la pena, no lo incluyas)
- La suma de todos los porcentajes debe ser exactamente 100%
- Incluye siempre una posición de "reserva de liquidez" si el perfil es conservador o moderado
- Justifica cada porcentaje con principios de los maestros
- Sé concreto con las cantidades en dinero, no solo porcentajes

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin backticks. Estructura exacta:

{
  "capitalTotal": number,
  "moneda": "USD" | "COP",
  "perfilUsado": "string",
  "fechaAsignacion": "ISO string",
  "resumenEstrategia": "string (3-4 oraciones explicando la lógica general)",
  "asignaciones": [
    {
      "ticker": "string",
      "nombre": "string",
      "tipo": "Acción" | "ETF" | "Cripto" | "Renta Fija" | "Commodity" | "Liquidez",
      "porcentaje": number,
      "montoAsignado": number,
      "maestroPrincipal": "Graham" | "Buffett" | "Lynch" | "Dalio" | "Soros" | "Munger",
      "justificacion": "string (2-3 oraciones: por qué este activo, por qué este %)",
      "riesgo": "Bajo" | "Medio" | "Alto" | "Muy Alto",
      "horizonteSugerido": "string",
      "precioEntradaSugerido": "string (rango o 'precio de mercado')"
    }
  ],
  "distribucionPorTipo": {
    "acciones": number,
    "etfs": number,
    "cripto": number,
    "rentaFija": number,
    "commodities": number,
    "liquidez": number
  },
  "distribucionPorRiesgo": {
    "bajo": number,
    "medio": number,
    "alto": number,
    "muyAlto": number
  },
  "advertencias": ["string"],
  "proximospasos": ["string (acciones concretas que debe tomar el usuario)"],
  "fraseMaestra": "string (frase memorable de uno de los maestros que resume la estrategia)"
}`;

  const userPrompt = `Construye el portafolio óptimo para este inversionista:

CAPITAL DISPONIBLE: ${capitalDisponible.toLocaleString()} ${monedaLabel}
${activosTexto}
${perfilTexto}
${restriccionesTexto}
${contextoLatam}

Distribuye el capital de forma inteligente, concreta y justificada. Cada peso/dólar debe tener una razón de ser.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
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
    } catch (e) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: "Error procesando respuesta de la IA", raw: rawText.substring(0, 300) }),
      };
    }

    resultado._metadata = {
      tokensEntrada: response.usage?.input_tokens ?? 0,
      tokensSalida: response.usage?.output_tokens ?? 0,
      timestamp: new Date().toISOString(),
    };

    return { statusCode: 200, headers, body: JSON.stringify(resultado) };

  } catch (error) {
    const status = error.status === 429 ? 429 : error.status === 401 ? 401 : 500;
    return {
      statusCode: status, headers,
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
};
