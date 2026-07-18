import { Download, Loader } from 'lucide-react'
import { useState } from 'react'
import { exportToCSV } from '@/lib/exportUtils'

interface ExportDataProps {
  data: any[]
  columns: Array<{ key: string; label: string }>
  filename?: string
}

export default function ExportData({ data, columns, filename = 'export' }: ExportDataProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleExportCSV = async () => {
    setIsLoading(true)
    try {
      exportToCSV(data, columns, `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
    } catch (error) {
      console.error('Erro ao exportar:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleExportCSV}
      disabled={isLoading || data.length === 0}
      className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-60"
      title="Exportar dados em CSV"
    >
      {isLoading ? (
        <>
          <Loader size={16} className="animate-spin" />
          Exportando...
        </>
      ) : (
        <>
          <Download size={16} />
          Exportar CSV
        </>
      )}
    </button>
  )
}
