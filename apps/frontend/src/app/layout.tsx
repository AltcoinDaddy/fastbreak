import type { Metadata } from 'next'
import './globals.css'
import { ClientProviders } from '../components/providers/ClientProviders'
import { SafeWebSocketStatus } from '../components/status/SafeWebSocketStatus'

export const metadata: Metadata = {
  title: 'FastBreak - NBA Top Shot Auto-Collector',
  description: 'AI-powered NBA Top Shot auto-collector dApp built on Flow blockchain',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <ClientProviders>
          <nav className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <h1 className="text-xl font-bold text-gray-900">FastBreak</h1>
                  </div>
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    <a href="/" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium">
                      Dashboard
                    </a>
                    <a href="/templates" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium">
                      Templates
                    </a>
                    <a href="/test" className="text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium">
                      Test Validation
                    </a>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <a href="/portfolio" className="text-gray-500 hover:text-gray-700 text-sm font-medium">Portfolio</a>
                  <a href="/strategies" className="text-gray-500 hover:text-gray-700 text-sm font-medium">Strategies</a>
                  <a href="/trades" className="text-gray-500 hover:text-gray-700 text-sm font-medium">Trades</a>
                  <SafeWebSocketStatus className="mr-2" />
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                    Connect Wallet
                  </button>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </ClientProviders>
      </body>
    </html>
  )
}