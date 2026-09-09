import "./globals.css";
export const metadata = {
  title: "Secret Hitler — The Table",
  description:
    "A game of trust and treason. An unofficial online adaptation for 5–10 players.",
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
