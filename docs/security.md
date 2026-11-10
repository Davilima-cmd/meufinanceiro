# Segurança e privacidade

Este aplicativo tratará dados financeiros. A segurança precisa ser implementada e revisada antes de qualquer dado bancário real; a Fase 0 não conecta banco nem autentica usuários.

## Regras para desenvolvimento

- Não usar dados bancários reais. Usar dados fictícios e sandbox.
- Nunca pedir ou guardar senha bancária.
- Nunca colocar credenciais, tokens ou chaves no Git, logs, testes ou documentação.
- Guardar valores locais em `.env`, ignorado pelo Git. `.env.example` contém apenas campos vazios.
- Tokens de provedores Open Finance devem ficar no backend quando essa integração for criada.
- Não confiar em `userId` enviado pelo cliente; a identidade deverá vir da sessão validada no servidor.

## Controles previstos, ainda pendentes

- Argon2id para senhas.
- Sessões revogáveis e MFA (TOTP).
- Cookie web `HttpOnly`, `Secure`, `SameSite` e proteção CSRF.
- Autorização centralizada para dono, compartilhamento e nível de acesso.
- Criptografia de campos sensíveis na aplicação com AES-256-GCM e chave fora do banco.
- Limites contra força bruta, abuso de endpoints e enumeração de contas.
- Validação de entrada em todos os endpoints e logs sem dados financeiros completos.
- Auditoria, backups com teste de restauração, política de retenção e revisão LGPD.
- Webhooks autenticados, idempotentes e com proteção contra duplicidade.

Nenhum controle listado como pendente deve ser considerado implementado apenas por estar documentado. Revisar esta lista nas fases 2, 4, 5 e 6 da especificação.
