/**
 * Webhook API para procesar facturas desde Glide
 *
 * Flujo:
 * 1. Glide envía POST con imagen base64 de factura
 * 2. Validar datos de entrada
 * 3. Verificar duplicados
 * 4. Extraer texto con Google Vision OCR
 * 5. Parsear datos de factura
 * 6. Guardar en Google Sheets
 * 7. Retornar puntos y confirmar
 */

require("dotenv").config();

const validation = require("../lib/validation");
const googleVision = require("../lib/googleVision");
const googleSheets = require("../lib/googleSheets");

// Verificar variables de entorno
function validateEnv() {
    if (!process.env.GOOGLE_CREDENTIALS) {
          throw new Error("GOOGLE_CREDENTIALS no configurada");
    }
    if (!process.env.GOOGLE_SHEETS_ID) {
          throw new Error("GOOGLE_SHEETS_ID no configurada");
    }
}

/**
 * Main handler para Vercel
 */
async function handler(req, res) {
    // CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,OPTIONS,PATCH,DELETE,POST,PUT"
        );
    res.setHeader(
          "Access-Control-Allow-Headers",
          "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
        );

  if (req.method === "OPTIONS") {
        return res.status(200).end();
  }

  if (req.method !== "POST") {
        return res.status(405).json({ error: "Solo POST es permitido" });
  }

  try {
        validateEnv();

      const {
              dni,
              phone,
              email,
              name,
              invoice_number,
              invoice_amount,
              invoice_image,
      } = req.body;

      console.log("📦 Webhook recibido de Glide");
        console.log("DNI:", dni);
        console.log("Teléfono:", phone);
        console.log("Email:", email);

      // PASO 1: Validar entrada
      console.log("✓ Paso 1: Validando datos de entrada...");
        const inputValidation = validation.validateInput({
                dni,
                phone,
                email,
                name,
                invoice_number,
                invoice_amount,
        });

      if (!inputValidation.valid) {
              console.error("❌ Validación fallida:", inputValidation.error);
              return res.status(400).json({
                        success: false,
                        error: inputValidation.error,
              });
      }

      // PASO 2: Verificar duplicados
      console.log("✓ Paso 2: Verificando duplicados...");
        const sheetsClient = googleSheets.initializeSheetsClient();
        const duplicateCheck = await validation.checkDuplicates(sheetsClient, {
                dni,
                phone,
                invoice_number,
        });

      if (duplicateCheck.hasDuplicates) {
              console.warn("⚠️  Duplicado detectado:", duplicateCheck.message);
              return res.status(409).json({
                        success: false,
                        error: duplicateCheck.message,
                        field: duplicateCheck.field,
              });
      }

      // PASO 3: Extraer texto con OCR (si se proporciona imagen)
      let ocrData = {
              invoice_number: invoice_number,
              invoice_amount: invoice_amount,
      };

      if (invoice_image) {
              console.log("✓ Paso 3: Ejecutando OCR con Google Vision...");
              try {
                        let imageBase64 = invoice_image;
                        if (invoice_image.includes(",")) {
                                    imageBase64 = invoice_image.split(",")[1];
                        }

                const extractedText = await googleVision.extractTextFromImage(
                            imageBase64
                          );
                        console.log("✓ Texto extraído de la factura");

                // PASO 4: Parsear datos de factura
                console.log("✓ Paso 4: Parseando datos de factura...");
                        ocrData = googleVision.parseInvoiceText(extractedText);

                if (!invoice_number && ocrData.invoice_number) {
                            ocrData.invoice_number = invoice_number || ocrData.invoice_number;
                }
                        if (!invoice_amount && ocrData.invoice_amount) {
                                    ocrData.invoice_amount = invoice_amount || ocrData.invoice_amount;
                        }
              } catch (ocrError) {
                        console.warn("⚠️  Error en OCR, usando datos manuales:", ocrError.message);
              }
      }

      // PASO 5: Guardar en Google Sheets
      console.log("✓ Paso 5: Guardando en Google Sheets...");
        const sheetResult = await googleSheets.addInvoiceToSheets({
                dni,
                phone,
                email,
                name,
                invoice_number: ocrData.invoice_number || invoice_number || "N/A",
                invoice_amount: ocrData.invoice_amount || invoice_amount || 0,
        });

      console.log("✅ Factura registrada exitosamente");
        console.log("Puntos totales:", sheetResult.totalPoints);

      // PASO 6: Retornar respuesta
      return res.status(200).json({
              success: true,
              message: "Factura procesada correctamente",
              data: {
                        dni,
                        name,
                        email,
                        phone,
                        invoice_number: ocrData.invoice_number || invoice_number,
                        invoice_amount: ocrData.invoice_amount || invoice_amount,
                        total_points: sheetResult.totalPoints,
                        participations: sheetResult.totalPoints,
              },
      });
  } catch (error) {
        console.error("❌ Error en webhook:", error);
        return res.status(500).json({
                success: false,
                error: "Error procesando factura: " + error.message,
        });
  }
}

// Para desarrollo local
if (require.main === module) {
    const http = require("http");
    const server = http.createServer((req, res) => {
          let body = "";
          req.on("data", (chunk) => {
                  body += chunk.toString();
          });
          req.on("end", async () => {
                  try {
                            req.body = body ? JSON.parse(body) : {};
                  } catch {
                            req.body = {};
                  }
                  await handler(req, res);
          });
    });

  const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
          console.log(`🚀 Servidor ejecutando en puerto ${PORT}`);
          console.log(`POST http://localhost:${PORT}/api/webhook`);
    });
}

module.exports = handler;
