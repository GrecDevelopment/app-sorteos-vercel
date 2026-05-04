/**
 * Validación de datos de entrada
  * - DNI: Formato Honduras 0000-0000-00000
   * - Teléfono: +504 XXXX-XXXX o 9XXXXXXX
    * - Email: Formato estándar
     * - Duplicados: DNI, teléfono, número de factura
      */

// Validar formato DNI (Honduras: 0000-0000-00000)
function validateDNI(dni) {
  if (!dni) return false;
  const dniRegex = /^\d{4}-\d{4}-\d{5}$/;
  return dniRegex.test(dni);
}

  // Validar teléfono (+504 XXXX-XXXX o 9XXXXXXX)
  function validatePhone(phone) {
    if (!phone) return false;
    const phoneRegex = /^(\+504\s?\d{4}-\d{4}|\+504\d{8}|9\d{7})$/;
    return phoneRegex.test(phone.replace(/\s/g, ""));
  }

    // Validar email
    function validateEmail(email) {
      if (!email) return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

      // Validar nombre (no vacío, mínimo 2 caracteres)
      function validateName(name) {
        if (!name) return false;
        return name.trim().length >= 2;
      }

        // Validar monto de factura (número positivo)
        function validateAmount(amount) {
          const parsed = parseFloat(amount);
          return !isNaN(parsed) && parsed > 0;
        }

          // Validar número de factura
          function validateInvoiceNumber(number) {
            if (!number) return false;
            return number.toString().trim().length > 0;
          }

            // Validación completa de entrada
            function validateInput(data) {
              const { dni, phone, email, name, invoice_number, invoice_amount } = data;

              if (!validateDNI(dni)) {
                return {
                        valid: false,
                        error: "DNI inválido. Formato esperado: 0000-0000-00000",
                        field: "dni",
                };
              }

                if (!validatePhone(phone)) {
                  return {
                          valid: false,
                          error: "Teléfono inválido. Formato esperado: +504 XXXX-XXXX o 9XXXXXXX",
                          field: "phone",
                  };
                }

                  if (!validateEmail(email)) {
                    return {
                            valid: false,
                            error: "Email inválido",
                            field: "email",
                    };
                  }

                    if (!validateName(name)) {
                      return {
                              valid: false,
                              error: "Nombre debe tener mínimo 2 caracteres",
                              field: "name",
                      };
                    }

                      if (invoice_number && !validateInvoiceNumber(invoice_number)) {
                        return {
                                valid: false,
                                error: "Número de factura inválido",
                                field: "invoice_number",
                        };
                      }

                        if (invoice_amount && !validateAmount(invoice_amount)) {
                          return {
                                  valid: false,
                                  error: "Monto de factura debe ser un número positivo",
                                  field: "invoice_amount",
                          };
                        }

                          return { valid: true };
            }

              // Verificar duplicados en Google Sheets
              async function checkDuplicates(sheetsClient, data) {
                try {
                  const { dni, phone, invoice_number } = data;

                      // Obtener todas las filas de la hoja de facturas
                  const response = await sheetsClient.spreadsheets.values.get({
                          spreadsheetId: process.env.GOOGLE_SHEETS_ID,
                          range: "invoices!A:G",
                  });

                  const rows = response.data.values || [];

                  // Verificar cada fila (skip header)
                  for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    // Formato: [id, phone, invoice_number, email, dni, invoice_amount, total_points]

                    if (dni && row[4] === dni) {
                      return {
                                  hasDuplicates: true,
                        message: `DNI ${dni} ya está registrado`,
                                  field: "dni",
                      };
                    }

                      if (phone && row[1] === phone) {
                        return {
                                    hasDuplicates: true,
                          message: `Teléfono ${phone} ya está registrado`,
                                    field: "phone",
                        };
                      }

                        if (invoice_number && row[2] === invoice_number) {
                          return {
                                      hasDuplicates: true,
                            message: `Factura ${invoice_number} ya fue registrada`,
                                      field: "invoice_number",
                          };
                        }
                        }

                          return { hasDuplicates: false };
                  } catch (error) {
                    console.error("Error checking duplicates:", error);
                    return { hasDuplicates: false }; // No bloquear si hay error
                  }
                }

                    module.exports = {
                        validateInput,
                        checkDuplicates,
                        validateDNI,
                        validatePhone,
                        validateEmail,
                        validateName,
                        validateAmount,
                        validateInvoiceNumber,
                    };
