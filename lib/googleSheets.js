/**
 * Google Sheets API para almacenar datos de facturas
 * Guarda: id, phone, invoice_number, email, dni, invoice_amount, total_points, created_at
 */

const { google } = require("googleapis");

/**
 * Inicializar cliente de Google Sheets
 * @returns {google.sheets_v4.Sheets} - Cliente autenticado
 */
function initializeSheetsClient() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Contar facturas registradas para un cliente (calcular puntos)
 * @param {google.sheets_v4.Sheets} sheetsClient - Cliente autenticado
 * @param {string} dni - DNI del cliente
 * @returns {Promise<number>} - Total de puntos (invoices)
 */
async function getCustomerPoints(sheetsClient, dni) {
    try {
          const response = await sheetsClient.spreadsheets.values.get({
                  spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                  range: "invoices!E:E", // Columna E contiene DNI
          });

      const rows = response.data.values || [];
          let count = 0;

      // Contar cuántas facturas tiene este DNI (skip header)
      for (let i = 1; i < rows.length; i++) {
              if (rows[i] && rows[i][0] === dni) {
                        count++;
              }
      }

      return count;
    } catch (error) {
          console.error("Error obteniendo puntos del cliente:", error);
          return 0;
    }
}

/**
 * Agregar factura a Google Sheets
 * @param {object} data - Datos de la factura
 * @returns {Promise<object>} - Resultado con totalPoints
 */
async function addInvoiceToSheets(data) {
    try {
          const sheetsClient = initializeSheetsClient();
          const { dni, phone, email, name, invoice_number, invoice_amount } = data;

      // Obtener ID único (usar timestamp + random)
      const id = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const createdAt = new Date().toISOString();

      // Primero contar facturas existentes ANTES de agregar esta
      const pointsBefore = await getCustomerPoints(sheetsClient, dni);

      // Agregar nueva fila a Google Sheets
      const response = await sheetsClient.spreadsheets.values.append({
              spreadsheetId: process.env.GOOGLE_SHEETS_ID,
              range: "invoices!A:H",
              valueInputOption: "RAW",
              resource: {
                        values: [
                                    [
                                                  id, // A: id
                                                  phone, // B: phone
                                                  invoice_number || "N/A", // C: invoice_number
                                                  email, // D: email
                                                  dni, // E: dni
                                                  invoice_amount || 0, // F: invoice_amount
                                                  pointsBefore + 1, // G: total_points (nueva fila suma 1 punto)
                                                  createdAt, // H: created_at
                                                ],
                                  ],
              },
      });

      console.log("✅ Factura agregada a Google Sheets:", id);

      return {
              success: true,
              id: id,
              totalPoints: pointsBefore + 1,
      };
    } catch (error) {
          console.error("Error agregando factura a Google Sheets:", error);
          throw error;
    }
}

/**
 * Obtener todas las facturas de un cliente
 * @param {google.sheets_v4.Sheets} sheetsClient - Cliente autenticado
 * @param {string} dni - DNI del cliente
 * @returns {Promise<array>} - Lista de facturas
 */
async function getCustomerInvoices(sheetsClient, dni) {
    try {
          const response = await sheetsClient.spreadsheets.values.get({
                  spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                  range: "invoices!A:H",
          });

      const rows = response.data.values || [];
          const invoices = [];

      // Filtrar por DNI (skip header)
      for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (row && row[4] === dni) {
                        invoices.push({
                                    id: row[0],
                                    phone: row[1],
                                    invoice_number: row[2],
                                    email: row[3],
                                    dni: row[4],
                                    invoice_amount: row[5],
                                    total_points: row[6],
                                    created_at: row[7],
                        });
              }
      }

      return invoices;
    } catch (error) {
          console.error("Error obteniendo facturas del cliente:", error);
          return [];
    }
}

module.exports = {
    initializeSheetsClient,
    addInvoiceToSheets,
    getCustomerPoints,
    getCustomerInvoices,
};
