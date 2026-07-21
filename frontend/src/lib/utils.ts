export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(date: string | Date) {
  if (typeof date === 'string') {
    const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      return `${day}/${month}/${year}`
    }

    if (/T00:00:00(?:\.000)?Z$/.test(date)) {
      const utcDate = new Date(date)
      return `${String(utcDate.getUTCDate()).padStart(2, '0')}/${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}/${utcDate.getUTCFullYear()}`
    }
  }

  return new Date(date).toLocaleDateString('pt-BR')
}
