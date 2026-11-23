import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

/** Títulos de página: serif de libro, con eje óptico para los tamaños grandes. */
export const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
});

/** Texto e interfaz. */
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-sans",
});

/** Cifras, importes, SKU, fechas, referencias y membretes. */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const fontVariables = `${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`;
