import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Аппетит — Учет смен',
  description: 'Внутренняя система учёта ФОТ и смен',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
