import "./globals.css";
export const metadata = {
  title: "Veiled Republic — A Game of Trust & Treason",
  applicationName: "Veiled Republic",
  description:
    "A private table for 5–10 friends. A noncommercial, unofficial social deduction adaptation of Secret Hitler.",
  icons: { icon: "/icon.svg" },
};
export default function Layout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p='system';try{p=localStorage.getItem('sh-theme')||'system'}catch(e){}document.documentElement.dataset.theme=(p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light'})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
