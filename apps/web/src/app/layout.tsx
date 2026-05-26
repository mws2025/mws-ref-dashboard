import type { Metadata } from "next"
import { Josefin_Sans, Geist } from "next/font/google"
import localFont from "next/font/local"
import "./globals.css"
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const josefinSans = Josefin_Sans({
  variable: "--font-josefin-sans",
  subsets: ["latin"],
})

const domusTitling = localFont({
  src: "./fonts/domus-titling.otf",
  variable: "--font-domus-titling",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Whisked - Baked to the beat",
  description: "Whisked - Baked to the beat",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", josefinSans.variable, domusTitling.variable, "font-sans", geist.variable)}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
