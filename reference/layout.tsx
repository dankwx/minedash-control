import type React from "react"
import type { Metadata } from "next"
import { Geist_Mono, Cormorant_Garamond } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geistMono = Geist_Mono({ subsets: ["latin"] })
const _cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: "MHASSAHROPOLIS",
  description: "All The Mods 10 - 5.1 Server",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="font-mono antialiased min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
