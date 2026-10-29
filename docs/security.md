# Segurança do Meu Financeiro

## Princípios

1. **Zero Trust**: Não confie em nenhuma entrada, valide tudo
2. **Princípio do Menor Privilégio**: Acesso mínimo necessário
3. **Defesa em Profundidade**: Múltiplas camadas de proteção
4. **Segurança por Design**: Segurança integrada desde o início
5. **Transparência**: Documentação clara de práticas de segurança

## Regras sobre Segredos

### ❌ NUNCA commite estes arquivos:

- `.env`, `.env.local`, `.env.*.local`
- Qualquer arquivo com credenciais reais
- Chaves privadas, certificados, tokens
- Arquivos de configuração com segredos

### ✅ SEMPRE use:

- `.env.example` com valores **claramente falsos** (ex.: `USUARIO:SENHA@HOST`)
- Gerenciadores de segredos (GitHub Secrets, 1Password, AWS Secrets Manager)
- Variáveis de ambiente injetadas no CI/CD

## O que NUNCA vai para o Git

| Tipo                   | Exemplos                               |
| ---------------------- | -------------------------------------- |
| Senhas                 | `password`, `senha`, `pwd`             |
| API Keys               | `api_key`, `apikey`, `secret_key`      |
| Tokens                 | `access_token`, `refresh_token`, `jwt` |
| Chaves privadas        | `-----BEGIN PRIVATE KEY-----`          |
| Certificados           | `.pem`, `.key`, `.crt`, `.p12`         |
| Strings de conexão     | `postgresql://user:pass@host`          |
| Chaves de criptografia | `encryption_key`, `secret`             |

## Checklist Inicial (expandir na Fase 5)

### Código

- [ ] Validação de entrada em todos os endpoints
- [ ] Sanitização de saída (XSS prevention)
- [ ] Rate limiting em APIs públicas
- [ ] Headers de segurança (CSP, HSTS, etc.)
- [ ] Validação de tipos com TypeScript strict mode

### Infraestrutura

- [ ] HTTPS obrigatório em produção
- [ ] Secrets scanning ativo (gitleaks)
- [ ] Dependabot alerts ativo
- [ ] Branch protection rules
- [ ] 2FA obrigatório para colaboradores

### Dados

- [ ] Criptografia em trânsito (TLS 1.3)
- [ ] Criptografia em repouso (AES-256)
- [ ] LGPD compliance (consentimento, direito ao esquecimento)
- [ ] Backup criptografado e testado
- [ ] Retenção de logs definida

### Open Finance (Fase futura)

- [ ] mTLS para todas as comunicações
- [ ] Certificados válidos e rotacionados
- [ ] Auditoria de consentimento
- [ ] Logs de acesso a dados financeiros

## Varredura de Segredos

- **gitleaks** configurado na CI
- Hook local opcional via `pre-commit`
- Padrões customizados em `.gitleaks.toml`

## Dependabot

Configurado em `.github/dependabot.yml` para:

- Atualizações semanais de dependências npm
- Alertas de vulnerabilidades (GitHub Advisory Database)
- PRs automáticos para patches de segurança

## Relato de Vulnerabilidades

Envie relatórios para: **security@meufinanceiro.com** (ou abra issue privada no GitHub)

Tempo de resposta alvo: 48h para triagem inicial.
