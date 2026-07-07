import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('theme')
    const isDarkMode = saved ? saved === 'dark' : true
    setIsDark(isDarkMode)
    applyTheme(isDarkMode)
  }, [])

  const applyTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }
  }

  const handleToggle = () => {
    const newDark = !isDark
    setIsDark(newDark)
    applyTheme(newDark)
    localStorage.setItem('theme', newDark ? 'dark' : 'light')
  }

  if (!mounted) return null

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
