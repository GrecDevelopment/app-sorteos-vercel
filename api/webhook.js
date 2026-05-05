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
const authentication = require("../lib/authentication");

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

      const { action = "upload_invoice" } = req.body;

      console.log("📦 Webhook recibido de Glide");
        console.log("Acción:", action);

      const sheetsClient = googleSheets.initializeSheetsClient();

      // RUTAR POR ACCIÓN
      if (action === "register") {
              return handleRegister(req, res, sheetsClient);
      } else if (action === "login") {
              return handleLogin(req, res, sheetsClient);
      } else if (action === "upload_invoice") {
              return handleUploadInvoice(req, res, sheetsClient);
      } else {
              return res.status(400).json({
                        success: false,
                        error: "Acción no válida. Use: register, login, o upload_invoice",
              });
      }
  } catch (error) {
        console.error("❌ Error en webhook:", error);
        return res.status(500).json({
                success: false,
                error: "Error procesando solicitud: " + error.message,
        });
  }
}

/**
 * Handler para REGISTRO DE USUARIO
 */
async function handleRegister(req, res, sheetsClient) {
  try {
    // Normalizar nombres de campos (acepta tanto mayúsculas como minúsculas)
    const dni = req.body.dni || req.body.DNI;
    const name = req.body.name || req.body.Name;
    const phone = req.body.phone || req.body.Teléfono;
    const email = req.body.email || req.body.Email;
    const password = req.body.password || req.body.Contraseña;

    console.log("🔐 Procesando REGISTRO");
    console.log("DNI:", dni);
    console.log("Email:", email);

    // Validar que todos los campos estén presentes
    if (!dni || !name || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Campos requeridos: dni, name, phone, email, password",
      });
    }

    // Registrar usuario
    const result = await authentication.registerUser(
      { dni, name, phone, email, password },
      sheetsClient
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    console.log("✅ Usuario registrado exitosamente");
    return res.status(201).json(result);
  } catch (error) {
    console.error("❌ Error en registro:", error);
    return res.status(500).json({
      success: false,
      error: "Error al registrar usuario: " + error.message,
    });
  }
}

/**
 * Handler para LOGIN
 */
async function handleLogin(req, res, sheetsClient) {
  try {
    // Normalizar nombres de campos
    const dni = req.body.dni || req.body.DNI;
    const password = req.body.password || req.body.Contraseña;

    console.log("🔐 Procesando LOGIN");
    console.log("DNI:", dni);

    // Validar que dni y password estén presentes
    if (!dni || !password) {
      return res.status(400).json({
        success: false,
        error: "Campos requeridos: dni, password",
      });
    }

    // Validar credenciales
    const result = await authentication.validateLogin(
      dni,
      password,
      sheetsClient
    );

    if (!result.success) {
      return res.status(401).json(result);
    }

    console.log("✅ Login exitoso para DNI:", dni);
    return res.status(200).json(result);
  } catch (error) {
    console.error("❌ Error en login:", error);
    return res.status(500).json({
      success: false,
      error: "Error al validar credenciales: " + error.message,
    });
  }
}

/**
 * Handler para UPLOAD DE FACTURA
 */
async function handleUploadInvoice(req, res, sheetsClient) {
  try {
    const {
      dni,
      phone,
      email,
      name,
      invoice_number,
      invoice_amount,
      invoice_image,
    } = req.body;

    console.log("📄 Procesando UPLOAD DE FACTURA");
    console.log("DNI:", dni);

    // PASO 1: Validar entrada
    const inputValidation = validation.validateInput({
      dni,
      phone,
      email,
      name,
      invoice_number,
      invoice_amount,
    });

    if (!inputValidation.valid) {
      return res.status(400).json({
        success: false,
        error: inputValidation.error,
      });
    }

    // PASO 2: Verificar duplicados
    const duplicateCheck = await validation.checkDuplicates(sheetsClient, {
      dni,
      phone,
      invoice_number,
    });

    if (duplicateCheck.hasDuplicates) {
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
      try {
        let imageBase64 = invoice_image;
        if (invoice_image.includes(",")) {
          imageBase64 = invoice_image.split(",")[1];
        }

        const extractedText = await googleVision.extractTextFromImage(
          imageBase64
        );
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

    // PASO 4: Guardar en Google Sheets
    const sheetResult = await googleSheets.addInvoiceToSheets({
      dni,
      phone,
      email,
      name,
      invoice_number: ocrData.invoice_number || invoice_number || "N/A",
      invoice_amount: ocrData.invoice_amount || invoice_amount || 0,
    });

    console.log("✅ Factura registrada exitosamente");

    // PASO 5: Retornar respuesta
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
    console.error("❌ Error en upload de factura:", error);
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
                                                                                                                                                                                                                                                                                                                                                                                                                                       