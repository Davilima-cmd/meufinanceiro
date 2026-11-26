/**
 * Sonda mínima: existe só para separar "a função não sobe" de "o Nest não sobe".
 * Sem imports, sem dependências.
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, node: process.version }));
}
