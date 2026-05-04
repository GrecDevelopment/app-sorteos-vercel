/**
 * Google Cloud Vision API para OCR
 * Extrae texto de imágenes de facturas
 */

const vision = require("@google-cloud/vision");

// Inicializar cliente de Vision
function initializeVisionClient() {
    // Las credenciales se obtienen automáticamente de GOOGLE_CREDENTIALS
  // Vercel inyecta la variable de entorno como JSON string
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  return new vision.ImageAnnotatorClient({
        credentials: credentials,
  });
}

/**
 * Extraer texto de una imagen (base64)
 * @param {string} imageBase64 - Imagen codificada en base64
 * @returns {Promise<string>} - Texto extraído de la imagen
 */
async function extractTextFromImage(imageBase64) {
    try {
          const client = initializeVisionClient();

      const request = {
              image: {
                        content: imageBase64,
              },
              features: [
                {
                            type: "DOCUMENT_TEXT_DETECTION",
                },
                      ],
      };

      const [result] = await client.annotateImage(request);
          const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
              return ""; // Imagen vacía o sin texto
      }

      // El primer elemento contiene todo el texto extraído
      return detections[0].description || "";
    } catch (error) {
          console.error("Error en Google Vision OCR:", error);
          throw error;
    }
}

/**
 * Parsear datos de factura desde texto extraído
 * Busca patrones comunes en facturas
 * @param {string} text - Texto extraído con OCR
 * @returns {object} - Datos parseados {invoice_number, invoice_amount}
 */
function parseInvoiceText(text) {
    const result = {
          invoice_number: null,
          invoice_amount: null,
    };

  if (!text) return result;

  // Buscar número de factura (patrón: "Factura #XXX" o "Invoice #XXX")
  const invoiceMatch = text.match(
        /(?:factura|invoice|no\.?|número)[\s:]*([A-Z0-9\-]+)/i
      );
    if (invoiceMatch && invoiceMatch[1]) {
          result.invoice_number = invoiceMatch[1].trim();
    }

  // Buscar monto total (patrón: "Total: $XXX.XX" o "TOTAL: XXX.XX")
  const amountMatch = text.match(/(?:total|amount)[\s:$]*([0-9]{1,10}[.,][0-9]{2})/i);
    if (amountMatch && amountMatch[1]) {
          const amountStr = amountMatch[1].replace(/[,]/g, ".");
          result.invoice_amount = parseFloat(amountStr);
    }

  // Si no encuentra con patrones anteriores, busca números grandes
  if (!result.invoice_amount) {
        const numberMatches = text.match(/[0-9]+[.,][0-9]{2}/g);
        if (numberMatches && numberMatches.length > 0) {
                // Tomar el número más grande que probablemente sea el total
          const numbers = numberMatches.map((n) => parseFloat(n.replace(/[,]/g, ".")));
                result.invoice_amount = Math.max(...numbers);
        }
  }

  return result;
}

module.exports = {
    extractTextFromImage,
    parseInvoiceText,
    initializeVisionClient,
};
