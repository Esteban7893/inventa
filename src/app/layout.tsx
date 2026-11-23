import type { Metadata } from "next";
import { fontVariables } from "@/app/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Inventa",
    template: "%s · Inventa",
  },
  description: "Inventario y pedidos para tu negocio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
