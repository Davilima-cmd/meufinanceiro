export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Meu Financeiro</title>
      </head>
      <body>
        <div id="__next">{children}</div>
      </body>
    </html>
  );
}
