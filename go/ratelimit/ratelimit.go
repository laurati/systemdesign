// Package ratelimit implementa os cinco algoritmos clássicos de rate limiting
// discutidos em entrevistas: token bucket, leaking bucket, fixed window,
// sliding window log e sliding window counter.
//
// Todas as implementações são in-memory e seguras para uso concorrente.
// Em produção, o estado normalmente fica em um store compartilhado (Redis)
// para que vários servidores apliquem o mesmo limite.
package ratelimit

import "time"

// Limiter decide se uma requisição de uma chave (usuário, IP, API key) pode passar.
type Limiter interface {
	Allow(key string) bool
}

// Clock permite injetar o tempo nos testes.
type Clock func() time.Time
