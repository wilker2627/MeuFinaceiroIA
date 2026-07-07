import { FileJson, Download, Loader } from 'lucide-react'
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
      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors"
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
