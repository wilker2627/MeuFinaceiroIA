/**
 * Exporta dados para CSV
 */
export function exportToCSV(
  data: any[],
  columns: Array<{ key: string; label: string }>,
  filename: string = 'export.csv'
) {
  // Headers
  const headers = columns.map(col => `"${col.label}"`).join(',')

  // Rows
  const rows = data.map(item =>
    columns
      .map(col => {
        let value = item[col.key]
        if (value === null || value === undefined) return '""'
        if (typeof value === 'string') {
          return `"${value.replace(/"/g, '""')}"`
        }
        return `"${value}"`
      })
      .join(',')
  )

  // Combine
  const csv = [headers, ...rows].join('\n')

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Valida em tempo real
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: false, error: 'E-mail é obrigatório' }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regex.test(email)) return { valid: false, error: 'E-mail inválido' }
  return { valid: true }
}

export function validateAmount(amount: string): { valid: boolean; error?: string } {
  if (!amount) return { valid: false, error: 'Valor é obrigatório' }
  const num = parseFloat(amount)
  if (isNaN(num)) return { valid: false, error: 'Valor deve ser um número' }
  if (num <= 0) return { valid: false, error: 'Valor deve ser maior que zero' }
  return { valid: true }
}

export function validateDescription(desc: string): { valid: boolean; error?: string } {
  if (!desc) return { valid: false, error: 'Descrição é obrigatória' }
  if (desc.length < 3) return { valid: false, error: 'Descrição deve ter pelo menos 3 caracteres' }
  return { valid: true }
}
