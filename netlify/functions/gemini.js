// Archivo: netlify/functions/gemini.js

exports.handler = async function(event, context) {
    // Solo permitimos peticiones tipo POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // Extraemos lo que nos envía tu página web
        const cuerpo = JSON.parse(event.body);
        const prompt = cuerpo.prompt;
        const modelo = cuerpo.modelo;
        
        // Obtenemos la clave de API segura desde Netlify
        const API_KEY = process.env.GEMINI_API_KEY;

        // Armamos la URL para Google
        const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;
        
        // Hacemos la consulta a Google
        const response = await fetch(urlGemini, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();

        // Le devolvemos la respuesta a tu página web
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno del servidor" }) };
    }
};
